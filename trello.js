const axios = require('axios').default;
const request = require("request")
const FormData = require('form-data');
const date = require('date-fns')
const fs = require('fs')

const util = require('util')

const _ = require('lodash')

module.exports = function(params) {

	let {trelloKey, trelloToken, trelloBoardId} = params

	let queryParams = {
		key: trelloKey,
		token: trelloToken 
	}

	let queryString = `key=${trelloKey}&token=${trelloToken}`

	let url = "https://api.trello.com/1"


	let log = console.log;
	let echo = (x) => {console.log(JSON.stringify(x,null,2))}
	let title = (x) => {console.log(chalk.red(x + "\n---------------------------------------------------------------------"))}

	let makeRequest = async (method,path,data,extraParams) => {

		return repeatUntilResolved(
			()=> {
				return axios({
					method: method,
					baseURL: url,
					url: path,
					data: data,
					params: {
						...queryParams, 
						...extraParams
					}
				})
			},
			(result) => {
				if (result.status === 429){
					return false
				} else {
					return true
				}
			}

		)

	}

	//magic repeater by george
	function repeatUntilResolved(userFunction, resultPredicate, continueOnReject = true, interval = 5, triesLeft = 15) {
		return new Promise(function(resolve, reject) {
			
			var waitAndRetry = ()=>{
				setTimeout(()=>{
					repeatUntilResolved(userFunction, resultPredicate, continueOnReject, interval, --triesLeft)
					.then(resolve, reject);	
				},interval * 1000)	
			}		

			if (triesLeft === 0) {
				console.error('Out of tries')
				reject('Out of tries')
			} else {
				userFunction()
				.then((result)=>{
					if (resultPredicate(result)) {
						resolve(result);
					} else {
						console.error('Retrying. Result didn\'t match expected: (' + util.inspect(result) + ')')
						waitAndRetry();
					}
				})
				.catch(function(err) {
					console.error('Retrying after error: ' + util.inspect(err))
					if (continueOnReject) {
						waitAndRetry();
					} else {
						reject(err);
					}
				});
			}
		});
	}

	let get = async (path, extraParams) => {
		return makeRequest("get",path,{},extraParams)
	}

	let put = async (path, data, extraParams) => {
		return makeRequest("put",path,data,extraParams)
	}

	let post = async (path, data, extraParams) => {
		return makeRequest("post",path,data,extraParams)
	}

	let del = async (path,extraParams) => {
		return makeRequest("delete",path,{},extraParams)
	}


	let uploadAttachment = async (imageLocation, cardId) => {
		return new Promise((resolve, reject) => {
			try {

				const formData = new FormData()

				formData.append("key", queryParams.key);
				formData.append("token", queryParams.token);
				formData.append("file", fs.createReadStream(imageLocation));

				var requestObj = request.post(url + '/cards/' + cardId + '/attachments', attachmentCallback);
				requestObj._form = formData;

				function attachmentCallback(err, httpResponse, body) {
					if (httpResponse.statusCode == 200) {
						resolve(JSON.parse(body));
					} else {
						reject('Could not attach the file to card:', httpResponse.statusMessage);
					}
				}

			}
			catch(e){
				reject("error uploading doc:" + e)
			}
		})
	}

	let trelloFunctions = {}

	// trelloFunctions.config = {
	// 	boardId: trelloBoardId
	// } 

// 	trelloFunctions.createCard = async (listName, card) => {
// 		let list = await trelloFunctions.createOrReturnList(listName)
// 
// 		card.idList = list.id
// 		card.locationName = card.location
// 
// 		let createdCard = (await post(`cards`,card)).data
// 
// 		let fieldSetResults = await Promise.all(
// 			
// 			_.map(card.customFields, async (customFieldValue, customFieldName)=>{
// 
// 				let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)
// 
// 				let result = await put(`card/${createdCard.id}/customField/${customFieldDefinition.id}/item`, {
// 					value: {text : customFieldValue}
// 				})
// 
// 				return result
// 			}) 
// 		)
// 
// 		log(fieldSetResults)
// 
// 	}


	trelloFunctions.createCard = async (listName, card) => {
		let list = await trelloFunctions.createOrReturnList(listName)

		card.idList = list.id
		card.locationName = card.location

		let createdCard = (await post(`cards`,card)).data

		let fieldSetResults = await Promise.all(
			
			_.map(card.customFields, async (customFieldValue, customFieldName)=>{
				return trello.setCustomField(createdCard.id, customFieldName, customFieldValue)
			}) 
		)

		log(fieldSetResults)

		return createdCard

	}

	trelloFunctions.setRawCustomFieldValue = async (cardId, customFieldName, customFieldValue) => {
		let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)

		let result = await put(`card/${cardId}/customField/${customFieldDefinition.id}/item`, {
			value: customFieldValue
		})

		return result.data

	}



	let setCustomField = async (cardId,fieldName, value, logText) => {

		let result
		let inputValueType = typeof value

		if (inputValueType == "object") {
			if (date.isDate(value)) {
				inputValueType = "date"
			} else {
				console.error("invalid object type provided while trying to set " + fieldName)
				throw "invalid object type provided while trying to set " + fieldName
			}
		}

		let targetField = await trelloFunctions.getCustomFieldDefinitionFromName(fieldName)


		console.log(logText)
		// console.log("setting " + fieldName + " to " + value )

		if (targetField.type == "list") {
			let validOptions = targetField.options.reduce((acc,option)=>{
				acc.push(option.value.text)
				return acc
			},[])

			if (validOptions.includes(value)) {
				let selectedOptionId = targetField.options.find(o => o.value.text == value).id

				result = await put(`card/${cardId}/customField/${targetField.id}/item`, {
					idValue: selectedOptionId
				})

			} else {
				let message = "You tried to set " + fieldName + " to " + value + " but the only valid options are " + validOptions
				console.error(message)
				throw message
			}
		} else if (targetField.type == "text") {
			if (inputValueType !== "string") {
				let message = "You tried to set " + fieldName + " to " + value + " but the value you provided was not a string : " + value
				console.error(message)
				throw message
			} else {

				result = await put(`card/${cardId}/customField/${targetField.id}/item`, {
					value:{text: value}
				})
			}
		} else if (targetField.type == "date") { 

			if (inputValueType !== "date") {
				let message = "You tried to set " + fieldName + " to " + value + " but the value you provided was not a date : " + value
				console.error(message)
				throw message
			} else {
				result = await put(`card/${cardId}/customField/${targetField.id}/item`, {
					value:{date: date.formatISO(value)}
				})
			}

		} else if (targetField.type == "number") { 
			if (inputValueType !== "number") {
				let message = "You tried to set " + fieldName + " to " + value + " but the value you provided was not a number : " + value
				console.error(message)
				throw message
			} else {
				result = await put(`card/${cardId}/customField/${targetField.id}/item`, {
					value:{number: value.toString()}
				})
			}
		} else if (targetField.type == "checkbox") { 
			if (inputValueType !== "boolean") {
				let message = "You tried to set " + fieldName + " to " + value + " but the value you provided was not a boolean : " + value
				console.error(message)
				throw message
			} else {
				result = await put(`card/${cardId}/customField/${targetField.id}/item`, {
					value:{checked: value.toString()}
				})
			}
		}

		return result

	} 

	trelloFunctions.writeCustomField = setCustomField

	trelloFunctions.setCustomField = async (cardId, customFieldName, customFieldValue = {text: "unset"}) => {
		try {

			let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)

			let result = await put(`card/${cardId}/customField/${customFieldDefinition.id}/item`, {
				value: customFieldValue
			})

			return result
		} catch (e) {
			console.error("couldnt set custom field:" + e)
		}	

	}

	trelloFunctions.setTextCustomFieldValue = async (cardId, customFieldName, customFieldValue) => {
		try {
			let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)

			return await put(`card/${cardId}/customField/${customFieldDefinition.id}/item`, {
				value: {text : customFieldValue}
			})
		} catch (e) {
			console.error("couldnt set custom field:" + e)
		}	
	}

	trelloFunctions.getTextCustomFieldValue = async (cardId, customFieldName) => {

		try {
			let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)

			let response = await get(`card/${cardId}`,{fields: "name" , customFieldItems: "true" })

			let customFieldItem = response.data.customFieldItems.find((cfi=>{ return cfi.idCustomField == customFieldDefinition.id }))

			if (customFieldItem) {
				console.log(JSON.stringify(response.data.customFieldItems))

				return customFieldItem.value.text
			} else {
				return false
			}



		} catch (e) {
			console.error("couldnt get custom field:" + e  )
		}
	}



	trelloFunctions.createOrReturnList = async (listName) => {
		try {
			let lists = await trelloFunctions.getLists()
			let matchingLists = lists.filter(l => l.name == listName)
			if (matchingLists.length > 0) {
				return matchingLists[0]
			} else {
				let response = await post(`boards/${trelloBoardId}/lists`,{
					name: listName,
					pos: "bottom"
				})
				return response.data
			}
		} catch (e) {
			console.error("couldnt create or return list:" + e)
		}

	}

	trelloFunctions.updateCard = (cardId, card) => {
		return put(`cards/${cardId}`,{},card)
	}

	trelloFunctions.getCustomFieldDefinitionFromName = async (customFieldName) => {
		let response = await get(`boards/${trelloBoardId}/customFields`)
			
		let field = response.data.filter(field => {return (field.name == customFieldName)})
		
		return field[0]

	}

	trelloFunctions.deleteAttachment = async (cardId, attachmentId) => {
		return await del(`/cards/${cardId}/attachments/${attachmentId}`)
	} 

	trelloFunctions.getAttachments = async (cardId) => {
		return await get(`/cards/${cardId}/attachments`)
	} 

	trelloFunctions.getCard = async (cardId, params = {customFieldItems : true}) => {
		return await get(`/cards/${cardId}`, params)
	}

	trelloFunctions.moveCard = async (cardId,  listName) => {
		try {
			let lists = await trelloFunctions.getLists()
			let matchingList = lists.find(l => l.name == listName)
			if (matchingList) {
				let response = await put(`cards/${cardId}`,{
					idList: matchingList.id,
					pos: "top"
				})
				return response.data
				
			} else {
				throw new Error("Couldnt find the specified list: " + listName)
			}
		} catch (e) {
			console.error("couldnt move card to list:" + e)
		}
	}

	trelloFunctions.archiveCard = async (cardId) => {

		try {
			return trelloFunctions.updateCard(cardId, {closed: true})
		} catch (e) {
			console.error("couldnt move card to list:" + e)
		}

	}

	trelloFunctions.getAllBoardData = async (customFieldNames) => {
		let cardData = await trelloFunctions.getAllBoardCards()
		let lists = await trelloFunctions.getLists()
		return await trelloFunctions.addCards(lists, cardData, customFieldNames)
	}

	trelloFunctions.getAllBoardCards = async (params = { cards: "open"}) => {
		let r =  await get(`boards/${trelloBoardId}/cards`, params)
		return r.data
	}

	trelloFunctions.getLists = async () => {
		let response = await get(`boards/${trelloBoardId}/lists`)
		return _.map(response.data, _.partialRight(_.pick,["id","name"]))
	}

	trelloFunctions.getLabels = async () => {
		let response = await get(`boards/${trelloBoardId}/labels`)
		return response.data
	}

	trelloFunctions.addCards = async (lists, allCards, customFieldNames =[], checkLists)=> {

		let c = await get(`boards/${trelloBoardId}/customFields`)
		let customFieldDefinitions = c.data;

		return Promise.all(
			lists.map(async (list)=>{

				let listCards = await get(`lists/${list.id}/cards`, { cards: "open", customFieldItems : true, checklists: "all" })

				let listCards2 = _.map(listCards.data, _.partialRight(_.pick, ['id', 'name', 'shortUrl','labels','checklists','customFieldItems']));

				list.cards = listCards2.map((card) => {

					//For each user supplied custom field name, filter for that field only 
					card.customFieldItems = customFieldNames.reduce( (acc,targetFieldName)=> {
						let targetField = _.find(customFieldDefinitions, f => { return f.name == targetFieldName } )
						
						let customField = _.find(card.customFieldItems, f => {
							
							if (typeof targetField["id"] == "undefined") {
								console.error("A custom field you specified isn't on this board")
								process.exit()
							} else {
								return f.idCustomField == targetField.id
							}
							
						})
						if (customField) {
							//set value for customfields that are list type
							if (targetField.type == "list") {
								customField.value = targetField.options.find(tfo => tfo.id == customField.idValue).value
							}

							customField.name = targetFieldName
							acc.push(customField)
						}
						return acc
						
					},[])


					if (card.labels.length == 0) {
						delete card.labels
					}

					if (card.checklists.length == 0) {
						delete card.checklists
					}

					if (card.customFieldItems.length == 0) {
						delete card.customFieldItems
					}

					card.list = {
						name: list.name,
						id:   list.id, 
					}

					return card;
				})
				return list
			})
		)
	}


	trelloFunctions.getFinalMovesForPeriod = async(cardData, projectNameForName,period) => {
		return await trelloFunctions.getManualMoveActions(cardData, projectNameForName)
	}




	trelloFunctions.getManualMoveActions = async (cardData, nameFilterFn, period = 7) => {

		let getMoveListForCard = (cardId, moveActions) => {

			let cards = _.filter(moveActions,(action)=>{
				return (action.data.card.id == cardId)
			})

			let moves = _.map(cards,(card)=>{
				return {
					from: nameFilterFn(card.data.listBefore.name).name,
					to: nameFilterFn(card.data.listAfter.name).name,
					date: new Date(card.date).toISOString()
				}
			})

			return moves
		}

		let getAllMoveActions = async () => {
			let params = {
				filter: "updateCard",
				since: date.subDays(Date.now(),7)
			}
			let response = await get(`boards/${trelloBoardId}/actions`, params)

			let moveActions = _.filter( response.data, (action) =>{
				if (typeof action.data.old["idList"] !== "undefined"){
					return action
				}
			})

			return moveActions
		}

		// Get Engineer project move history 
		let moveActions = await getAllMoveActions()

		let moveReports = await Promise.all(cardData.map(async (card)=>{
			let moveList = getMoveListForCard(card.id, moveActions)

			if (moveList.length == 0) {
				return false
			} else {

				let finalMove = {
					date: moveList[0].date,
					from: moveList.slice(-1)[0].from,
					to:   moveList[0].to
				}

				if (finalMove.from === finalMove.to) {
					return false
				} else {
					return {
						// moveList : moveList,
						move: finalMove,
						id: card.id,
						name: card.name
					}
				}
			}




		}))

		return _.filter(moveReports, (moveReport)=>{
			return (moveReport.move) 
		})

	}

	trelloFunctions.uploadAttachment = uploadAttachment

	return trelloFunctions
};



