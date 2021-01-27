const axios = require('axios').default;
const request = require("request")
const FormData = require('form-data');
const date = require('date-fns')
const fs = require('fs')

const util = require('util')

const _ = require('lodash')

let log = console.log;
let echo = (x) => {console.log(JSON.stringify(x,null,2))}
let title = (x) => {console.log(chalk.red(x + "\n---------------------------------------------------------------------"))}


if (!("TRELLO_TOKEN" in process.env)) {
    console.log('No TRELLO_TOKEN  has been set.');
    process.exit(1)
}

if (!("TRELLO_KEY" in process.env)) {
    console.log('No TRELLO_KEY has been set.');
    process.exit(1)
}


let queryParams = {
	key: process.env.TRELLO_KEY,
	token: process.env.TRELLO_TOKEN
}

let queryString = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`

let url = "https://api.trello.com/1"

let boardId = "n6VBFMpa"


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
function repeatUntilResolved(userFunction, resultPredicate, continueOnReject = true, interval = 5, triesLeft = 30) {
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
				console.error('Retrying after error: ' + err)
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
	return makeRequest("del",path,{},extraParams)
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

trelloFunctions.createCard = async (listName, card) => {
	let list = await trelloFunctions.createOrReturnList(listName)

	let createdCard = (await post(`cards`,{
		idList: list.id,
		name: card.name,
		locationName: card.location
	})).data

	let fieldSetResults = await Promise.all(
		
		_.map(card.customFields, async (customFieldValue, customFieldName)=>{

			let customFieldDefinition = await trelloFunctions.getCustomFieldDefinitionFromName(customFieldName)

			let result = await put(`card/${createdCard.id}/customField/${customFieldDefinition.id}/item`, {
				value: {text : customFieldValue}
			})

			return result
		}) 
	)

	log(fieldSetResults)

}



trelloFunctions.createOrReturnList = async (listName) => {
	try {
		let lists = await trelloFunctions.getLists()
		let matchingLists = lists.filter(l => l.name == listName)
		if (matchingLists.length > 0) {
			return matchingLists[0]
		} else {
			let response = await post(`boards/${boardId}/lists`,{
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
	let response = await get(`boards/${boardId}/customFields`)
		
	let projectStartDateField = response.data.filter(field => {return (field.name == customFieldName)})
	
	return projectStartDateField[0]

}

trelloFunctions.deleteAttachment = async (cardId, attachmentId) => {
	return await delete(`/cards/${cardId}/attachments/${attachmentId}`)
} 

trelloFunctions.getAttachments = async (cardId) => {
	return await get(`/cards/${cardId}/attachments`)
} 

trelloFunctions.getAllBoardData = async (boardId) => {
	let params = {
		cards: "open",
		customFieldItems : true 
	}
	let r =  await get(`boards/${boardId}/cards`, params)
	return r.data
}

trelloFunctions.getLists = async () => {
	let response = await get(`boards/${boardId}/lists`)
	return _.map(response.data, _.partialRight(_.pick,["id","name"]))
}

trelloFunctions.addCards = async (lists, allCards, customFieldNames)=> {

	let c = await get(`boards/${boardId}/customFields`)
	let customFieldData = c.data;

	return Promise.all(
		lists.map(async (list)=>{
			let listCards = await get(`lists/${list.id}/cards`)

			let listCards2 = _.map(listCards.data, _.partialRight(_.pick, ['id', 'name', 'labels']));

			list.cards = listCards2.map((card) => {

				let lookedUpCard = _.find(allCards, c => {return c.id == card.id})
				let filteredCard = _.pick(lookedUpCard, ['customFieldItems']);

				if (card.labels.length == 0) {
					delete card.labels
				}

				//For each user supplied custom field name, filter for that field only 
				let customFieldItems = customFieldNames.reduce( (acc,targetFieldName)=> {

					let targetField = _.find(customFieldData, f => { return f.name == targetFieldName } )
					
					let customField = _.find(filteredCard.customFieldItems, f => {return f.idCustomField == targetField.id})
					if (customField) {
						customField.name = targetFieldName
						acc.push(customField)
					}
					return acc
					
				},[])

				if (customFieldItems.length > 0) {
					filteredCard.customFieldItems = customFieldItems
				} else {
					delete filteredCard.customFieldItems
				}
				

				let result =  {
					...card,
					...filteredCard
				}
				return result;
			})
			return list
		})
	)
}




trelloFunctions.getManualMoveActions = async (boardId, cardData, nameFilterFn) => {

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

	let getAllMoveActions = async (boardId) => {
		let params = {
			filter: "updateCard",
			since: date.subDays(Date.now(),7)
		}
		let response = await get(`boards/${boardId}/actions`, params)

		let moveActions = _.filter( response.data, (action) =>{
			if (typeof action.data.old["idList"] !== "undefined"){
				return action
			}
		})

		return moveActions
	}

	// Get Engineer project move history 
	let moveActions = await getAllMoveActions(boardId)

	let moveReports = await Promise.all(cardData.map(async (card)=>{
		let moveList = getMoveListForCard(card.id, moveActions)
		return {
			// moveList : moveList,
			move: moveList[0],
			id: card.id,
			name: card.name
		}
	}))

	return _.filter(moveReports, (moveReport)=>{
		return (moveReport.move) 
	})

}

trelloFunctions.uploadAttachment = uploadAttachment

module.exports = trelloFunctions