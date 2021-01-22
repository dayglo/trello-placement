const axios = require('axios').default;
const util = require('util')
const _ = require('lodash')

let log = console.log;
// letgit push  echo = (x) => {console.log(util.inspect(x))}
let echo = (x) => {console.log(JSON.stringify(x,null,2))}


if (!("TRELLO_TOKEN" in process.env)) {
    console.log('No TRELLO_TOKEN  has been set.');
    process.exit(1)
}

if (!("TRELLO_KEY" in process.env)) {
    console.log('No TRELLO_KEY has been set.');
    process.exit(1)
}

let url = "https://api.trello.com/1"
let boardId = "n6VBFMpa"

let queryParams = {
	key: process.env.TRELLO_KEY,
	token: process.env.TRELLO_TOKEN
}

// let queryString = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`


async function main(){

	// let projectStartDateFieldId = (await getCustomFieldDefinitionFromName("Project Start Date")).id

	// echo(projectStartDateFieldId)

	let cardData = await getAllBoardData(boardId)
	// echo(cardData)

	let lists = await getLists()
	let listsAndCards = await addCards(lists, cardData, ["Project Start Date"])


	echo(listsAndCards)

	let outputReport = await makeBillingReport(listsAndCards)

	echo(outputReport)

}

let getAllBoardData = async (boardId) => {
	let params = {
		cards: "open",
		customFieldItems : true 
	}
	return (await get(`boards/${boardId}/cards`, params)).data
}




let get = async (path, extraParams) => {

	try {
		return await axios.get(`${url}/${path}`,
			{
				params: {
					...queryParams, 
					...extraParams
				}
			}
		)
	}
	catch (e){
		log("error making request: " +e)
	}
}


// curl https://api.trello.com/1/boards/5a00adcebe1991022b4a4bb4/cards/?fields=name&customFieldItems=true&key={APIKey}&token={APIToken}

let getCustomFieldDefinitionFromName = async (customFieldName) => {
	let response = await get(`boards/n6VBFMpa/customFields`)
		
	let projectStartDateField = response.data.filter(field => {return (field.name == customFieldName)})
	
	return projectStartDateField[0]
	// echo(projectStartDateField)

}



let getLists = async () => {
	let response = await get(`boards/n6VBFMpa/lists`)
	return _.map(response.data, _.partialRight(_.pick,["id","name"]))
}



let addCards = async (lists, allCards, customFieldNames)=> {

	let c = await get(`boards/n6VBFMpa/customFields`)
	let customFieldData = c.data;

	return Promise.all(
		lists.map(async (list)=>{
			let listCards = await get(`lists/${list.id}/cards`)

			let listCards2 = _.map(listCards.data, _.partialRight(_.pick, ['id', 'name', 'labels']));

			list.cards = listCards2.map((card) => {

				let lookedUpCard = _.find(allCards, c => {return c.id == card.id})
				let filteredCard = _.pick(lookedUpCard, ['customFieldItems']);

		
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

let makeBillingReport = async (lists) => {

	let report = {
		perProject:[

		],
		totals:{
			placed:0,
			billing: 0,
			nonBilling: 0
		}
	}

	lists.forEach((list)=>{
		let matches = list.name.match(/^((p|P)roject|PROJECT) - (.+)/) 

		if (matches) {
			let projectTotals = {
				project: matches[3],
				consultants: {
					placed: 0,
					billing: 0,
					nonBilling: 0
				}
			}

			list.cards.forEach((card=>{

				projectTotals.consultants.placed++ 

				let billing = true;
				card.labels.forEach((label)=>{
					if (label.name == "non billing") {
						billing = false	
					} 

				})
				if (billing) {
					projectTotals.consultants.billing++
				} else {
					projectTotals.consultants.nonBilling++
				}
				

			}))

			
			report.perProject.push(projectTotals)
		} 

	})

	report.totals = report.perProject.reduce(
		(acc, project) => {
			acc.billing += project.consultants.billing	
			acc.nonBilling += project.consultants.nonBilling
			acc.placed += project.consultants.placed				
			return acc
		},
		report.totals
	)

	return report
}


// Start
(async function() {
	await main();
})();


