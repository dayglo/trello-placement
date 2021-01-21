const axios = require('axios').default;
const util = require('util')

let log = console.log;
// let echo = (x) => {console.log(util.inspect(x))}
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

let queryParams = {
	key: process.env.TRELLO_KEY,
	token: process.env.TRELLO_TOKEN
}

// let queryString = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`


async function main(){

	getCustomFieldDefinitions()

	let lists = await getLists()
	let listsAndCards = await addCards(lists)

	//echo (await getAllBoardData('n6VBFMpa'))





	let outputReport = await makeBillingReport(listsAndCards)

	echo(outputReport)

}

let getAllBoardData = async (boardId) => {
	let params = {
		cards: "open"
	}
	return (await get(`boards/${boardId}`, params)).data
}




let get = async (path, extraParams) => {


	return await axios.get(`${url}/${path}`,
		{
			params: {
				...queryParams, 
				...extraParams
			}
		}
	)
}


// curl https://api.trello.com/1/boards/5a00adcebe1991022b4a4bb4/cards/?fields=name&customFieldItems=true&key={APIKey}&token={APIToken}

let getCustomFieldDefinitions = async () => {
	let response = await get(`boards/n6VBFMpa/customFields`)
		
	let projectStartDateField = response.data.filter(field => {return (field.name == "Project Start Date")})
	
	// echo(projectStartDateField)

}



let getLists = async () => {
	let response = await get(`boards/n6VBFMpa/lists`)
	return response.data
}


let addCards = async (lists)=> {
	return Promise.all(
		lists.map(async (list)=>{
			let cards = await get(`lists/${list.id}/cards`)
			list.cards = cards.data
			echo(cards.data)
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


