const csv = require('csv-parser');
const fs = require('fs');

const trello = require ('./trello.js')

let data = []
let boardId = "n6VBFMpa"


let	log = console.log

fs.createReadStream('./engineer.csv')
  .pipe(csv())
  .on('data', (row) => {
    data.push(row)
  })
  .on('end', () => {
    importData()
  });

let importData = async () => {

	console.log(data)

	let cardData = await trello.getAllBoardData(boardId)

	let lists = await trello.getLists()
	let listsAndCards = await trello.addCards(lists, cardData, ["Project Start Date", "SC","Not SC Eligible", "Skills", "Employee ID"])

	// let trello.createCard

	data = data.slice(0,1)


	const reduceLoop = async _ => {
		console.log('Start')

		const sum = await fruitsToGet.reduce(async (promisedSum, fruit) => {
			const sum = await promisedSum
			const numFruit = await getNumFruit(fruit)
			return sum + numFruit
		}, 0)

		console.log(sum)
		console.log('End')
	}



	let results = data.reduce( async (acc, person)=>{
		//person: Employee Id,First Name,Last Name,Work Email,Start Date,Job Role,Department,Post Code
		//find their card

		let existingCard = ""

		let matchingCards = cardData.filter(c => {
			if (c.customFieldItems.length > 0) {
				let employeeIdCustomField = c.customFieldItems.filter(i => i.name === "Employee ID")			
				if (employeeIdCustomField.length > 0) {
					let currentCardEmployeeId = employeeIdCustomField[0].value.number
					if (currentCardEmployeeId === person["Employee Id"]) {
						return c
					}
				}
			}
		})

		return acc.then(()=>{

			if (matchingCards.length == 0) {

				return trello.createCard(
				person.Department,
				{
					name: `${person["First Name"]} ${person["Last Name"]}`,
					location: person["Post Code"],
					customFields: {
						Email: person["Work Email"],
						"Employee ID": person["Employee Id"]
					}
				})

			} else if (matchingCards.length > 1 ){
				console.error("There are two cards with the same employee ID field : " + matchingCards.map(c => c.id).join(",") )
			} else {
				// one matching card - update its fields
				// existingCard = matchingCards[0])
				// trello.updateCard(existingCard.id,{
				// 	
				// })
			}
		})

	},Promise.resolve())

	let g = results;

	// let createList = 


	// for each person, if there's already a card for them
		// update the custom fields
		// move them to the correct list (creating it if it doesnt exist)

}