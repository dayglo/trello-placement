const axios = require('axios').default;
const util = require('util')
const _ = require('lodash')
const date = require('date-fns')
const chalk = require("chalk")
const fs = require('fs')
const FormData = require('form-data');
const request = require("request")

const crypto = require('crypto');

const fsWriteFile = util.promisify(fs.writeFile);
const fsReadFile = util.promisify(fs.readFile);

const { createCanvas, loadImage } = require('canvas')

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

let url = "https://api.trello.com/1"
let boardId = "n6VBFMpa"


let queryParams = {
	key: process.env.TRELLO_KEY,
	token: process.env.TRELLO_TOKEN
}

let queryString = `key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`


let projectNameForName = (cardName) => {
		let matches = cardName.match(/^((p|P)roject|PROJECT) - (.+)/) 

		if (matches) {
			return {
				replaced: true,
				name: matches[3]
			}
		} else {
			return {
				replaced: false,
				name: cardName
			}
		}
}

let readHash = async (file) => {
	return new Promise((resolve,reject)=>{

		fs.stat(file, async function(err, stat) {
		    if(err == null) {
		        let data = await fsReadFile(file, "utf8")
				resolve(data)

		    } else if(err.code === 'ENOENT') {
		        resolve(0)
		    } else {
		        reject('Error opening hash file: ', err.code);
		    }
		});

	})
}

async function main(){
	return new Promise( async (resolve,reject)=>{
		try {

			let formatDescription = (desc) => {return "```\n" + JSON.stringify(desc,null,2) + "\n```"}
			let dateString = date.format(new Date(), 'yyyy-MM-dd-h:mm:ss')

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			//Get Pertinent trello data in a clean intermediate format
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let cardData = await getAllBoardData(boardId)
			let lists = await getLists()
			let listsAndCards = await addCards(lists, cardData, ["Project Start Date", "SC","Not SC Eligible", "Skills"])

			let listsAndCards2 = listsAndCards.map(l => {
				let result = projectNameForName(l.name)
				l.projectName = result.name
				l.project = result.replaced
				return l
			})

			title("cleaned data")
			echo(listsAndCards2)

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Billing Report
			//-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let billingReportCardId = 'XbIkyoda'
			
			let outputReport = await makeBillingReport(listsAndCards)
			title("Billing Report")
			echo(outputReport)

			let reportHash = crypto.createHash('md5').update(JSON.stringify(outputReport)).digest('hex')
			
			if (reportHash == await readHash("/tmp/billingReport.txt")) {
				console.log("Billing report: the hash is the same so don't re-update the board")
			} else {
				console.log("Billing report: re-update the board")

				let imageLocation = createImageFile(
					billingTextFn(
						outputReport.totals.billing,
						outputReport.totals.nonBilling,
						outputReport.totals.pendingStartDate
					),
					"billing-" + dateString,
					1200,
					1000
				)[0]

				let attachments = await get(`/cards/${billingReportCardId}/attachments`)
				let newAttachment = await uploadAttachment(imageLocation, billingReportCardId)
				
				log ("deleting " + attachments.data.length + " old attachments")
				await Promise.all(
					attachments.data.map(a => {
						return del(`/cards/${billingReportCardId}/attachments/${a.id}`)
					})
				)

				put(`cards/${billingReportCardId}`,{},{
					desc: formatDescription(outputReport),
					idAttachmentCover: newAttachment.id
				})

				await fsWriteFile("/tmp/billingReport.txt", reportHash, "utf8")
			}

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Move report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let moveReportCardId = 'o5RSYrsE'

			let manualMoveReports = await getManualMoveActions(cardData)
			title("Manual Moves this week")
			echo(manualMoveReports)

			reportHash = crypto.createHash('md5').update(JSON.stringify(manualMoveReports)).digest('hex')
			
			if (reportHash == await readHash("/tmp/moveReport.txt")) {
				console.log("Move report: the hash is the same so don't re-update the board")
			} else {
				console.log("Move report: re-update the board")

				let moveReportImageLocation = createImageFile(
					movesTextFn(manualMoveReports),
					"moves-" + dateString,
					2000,
					20 + (200 * manualMoveReports.length)
				)[0]


				attachments = await get(`/cards/${moveReportCardId}/attachments`)
				newAttachment = await uploadAttachment(moveReportImageLocation, moveReportCardId)
				
				log ("deleting " + attachments.data.length + " old attachments")
				await Promise.all(
					attachments.data.map(a => {
						return del(`/cards/${moveReportCardId}/attachments/${a.id}`)
					})
				)

				
				put(`cards/${moveReportCardId}`,{},{
					desc: formatDescription(manualMoveReports),
					idAttachmentCover: newAttachment.id
				})
				
				await fsWriteFile("/tmp/moveReport.txt", reportHash, "utf8")
			}

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Starter report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let starterReportCardId = 'WRU9n5sv'

			let starterReport = await getStarterReport(listsAndCards)
			title ("Starters next week")
			echo(starterReport)

			reportHash = crypto.createHash('md5').update(JSON.stringify(starterReport)).digest('hex')

			if (reportHash == await readHash("/tmp/starterReport.txt")) {
				console.log("Starter Report: the hash is the same so don't re-update the board")
			} else {
				console.log("Starter report: re-update the board")

				let starterReportImageLocation = createImageFile(
					starterTextFn(starterReport),
					"starters-" + dateString,
					2000,
					20 + (200 * starterReport.length)
				)[0]

				attachments = await get(`/cards/${starterReportCardId}/attachments`)
				newAttachment = await uploadAttachment(starterReportImageLocation, starterReportCardId)
				
				log ("deleting " + attachments.data.length + " attachments")
				await Promise.all(
					attachments.data.map(a => {
						return del(`/cards/${starterReportCardId}/attachments/${a.id}`)
					})
				)

				put(`cards/${starterReportCardId}`,{},{
					desc: formatDescription(starterReport),
					idAttachmentCover: newAttachment.id
				})


				await fsWriteFile("/tmp/starterReport.txt", reportHash, "utf8")

			}

			//snap vacancy cards back.



			resolve("done")

		} catch (e) {
			reject (e)
		}
	})

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
// 
// let deleteCardAttachments = async (cardId) => {
// 	let attachments = get(`/cards/${cardId}/attachments`)
// 	return Promise.all(
// 		attachments.map(a => {
// 			return del(`/cards/${cardId}/attachments/${a}`)
// 		})
// 	)
// 
// }

let starterTextFn = (starters) => {
	return (rect, text )=>{
		let i = 20
		starters.forEach(move => {
			text(`${move.name}:`,	i,	 10, "#22A", '60pt Menlo')
			text(` --> ${move.to}`,	i,	 600, "#491", '60pt Menlo')
			i += 200
		})
	}
}

let movesTextFn = (moves) => {
	return (rect, text )=>{
		let i = 20
		moves.forEach(move => {
			text(`${move.name}:`,							i,	 10, "#22A", '60pt Menlo')
			text(`${move.move.from} --> ${move.move.to}`,	i,	 600, "#A2A", '60pt Menlo')
			i += 200
		})
	}
}

let billingTextFn = (billing = 0, nonBilling = 0, pending = 0, lab = 0) => {
	return (rect, text )=>{

		text("Billing: " + billing, 				5,	 10, "#2A2", '60pt Menlo')
		text("Not Billing: " + nonBilling,			200, 10, "#F00", '60pt Menlo')
		text("(Pending Start: " + pending + ")" ,	280, 20, "#22A", '40pt Menlo')
		text("Lab: " + lab + "" 				,	520, 10, "#F96", '60pt Menlo')

	}
}

let createImageFile = (drawFn, outputFileName, width = 1200, height = 580)=>{

	const padding = 30
	const canvas = createCanvas(width, height)
	const context = canvas.getContext('2d')

	//Set background
	context.fillStyle = "#FFF"
	context.fillRect(0,0,width,height)

	let rect = (top, height, color = '#3A3') => {
		context.fillStyle = color
		context.fillRect(padding, top + padding, width - (padding * 2), height - (padding * 2))
	}

	let text = (text, top = 0, left = 0, color = '#EEE', font  = '100pt Menlo') => {
		// log("WOOOOOO: "  + left)
		let myHeight = context.measureText(text).height
		context.fillStyle = color
		context.font = font
		context.fillText(text, left + padding, top + padding + 70)
	}
	//Main pane
	rect(0,height,"#FFE")

	drawFn(rect, text)

	const buffer = canvas.toBuffer('image/png')
	let fileName = `/tmp/generated-report-${outputFileName}.png` 
	fs.writeFileSync(fileName, buffer)
	return [fileName, buffer]

}


let getStarterReport = async(listsAndCards)=>{
	let starters = []

	listsAndCards.forEach((list)=>{
		list.cards.forEach((card)=>{
			if (card["customFieldItems"]) {
				card.customFieldItems.forEach((field)=>{
					if (field.name == "Project Start Date") {
						let projectStartDate = Date.parse(field.value.date)
						if (date.compareAsc(Date.now(), projectStartDate) == -1) {
							starters.push({
								name: card.name,
								to: projectNameForName(list.name).name,
								date: field.value.date
							})
						} 
					} 
				})
			}
		})
	})

	return starters

}


let getAllBoardData = async (boardId) => {
	let params = {
		cards: "open",
		customFieldItems : true 
	}
	let r =  await get(`boards/${boardId}/cards`, params)
	return r.data
}

let getAllMoveActions = async (boardId, 		) => {
	let params = {
		filter: "updateCard",
		since: date.subDays(Date.now(),7)
	}
	let response = await get(`boards/${boardId}/actions`, params)

	return _.filter( response.data, (action) =>{
		if (typeof action.data.old["idList"] !== "undefined"){
			return action
		}
	})

}

let getManualMoveActions = async (cardData) => {

	// Get Engineer project move history 
	let moveActions = await getAllMoveActions(boardId)

	let moveReports = await Promise.all(cardData.map(async (card)=>{
		let moveList = await getMoveListForCard(card.id, moveActions)
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

let getMoveListForCard = (cardId, moveActions) => {

	let cards = _.filter(moveActions,(action)=>{
		return (action.data.card.id == cardId)
	})

	let moves = _.map(cards,(card)=>{
		return {
			from: projectNameForName(card.data.listBefore.name).name,
			to: projectNameForName(card.data.listAfter.name).name,
			date: new Date(card.date).toISOString()
		}
	})

	return moves

}

let get = async (path, extraParams) => {

	try {
		return await axios.get(
			`${url}/${path}`,
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

let put = async (path, data, extraParams) => {

	try {
		return await axios.put(
			`${url}/${path}`,
			data,
			{
				params: {
					...queryParams, 
					...extraParams
				}
			}
		)
	}
	catch (e){
		log("error making put request: " +e)
	}
}

let post = async (path, data, extraParams) => {

	try {
		return await axios.post(
			`${url}/${path}`,
			data,
			{
				params: {
					...queryParams, 
					...extraParams
				}
			}
		)
	}
	catch (e){
		log("error making post request: " +e)
	}
}

let del = async (path,extraParams) => {

	try {
		return await axios.delete(
			`${url}/${path}`,
			{
				params: {
					...queryParams, 
					...extraParams
				}
			}
		)
	}
	catch (e){
		log("error making del request: " +e)
	}
}

let getCustomFieldDefinitionFromName = async (customFieldName) => {
	let response = await get(`boards/${boardId}/customFields`)
		
	let projectStartDateField = response.data.filter(field => {return (field.name == customFieldName)})
	
	return projectStartDateField[0]

}



let getLists = async () => {
	let response = await get(`boards/${boardId}/lists`)
	return _.map(response.data, _.partialRight(_.pick,["id","name"]))
}



let addCards = async (lists, allCards, customFieldNames)=> {

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

let makeBillingReport = async (lists) => {

	let now = Date.now()

	let report = {
		perProject:[

		],
		totals:{
			placed:0,
			billing: 0,
			nonBilling: 0,
			pendingStartDate: 0
		}
	}

	lists.forEach((list)=>{
		if (list["project"]) {

			let projectTotals = {
				project: list.projectName,
				consultants: {
					placed: 0,
					billing: 0,
					nonBilling: 0,
					pendingStartDate: 0

				}
			}

			list.cards.forEach((card=>{

				projectTotals.consultants.placed++ 

				let billing = true;

				if (card["label"]) {
					card.labels.forEach((label)=>{
						if (label.name == "non billing") {
							billing = false	
						} 

					})
				}

				if (card["customFieldItems"]) {
					card.customFieldItems.forEach((field)=>{
						if (field.name == "Project Start Date") {
							let projectStartDate = Date.parse(field.value.date)
							if (date.compareAsc(Date.now(), projectStartDate) == -1) {
								billing = false
								projectTotals.consultants.pendingStartDate++
							} 
						} 

					})
				}

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
			acc.pendingStartDate += project.consultants.pendingStartDate				
			return acc
		},
		report.totals
	)

	return report
}

const isGoogleCloudEnv = !!process.env.GCP_PROJECT 

if (!isGoogleCloudEnv) {
	// Start
	(async function() {
		await main();
	})();
}

exports.createReport = (req, res) => {
  main()
  .then(()=>{
    let message = req.query.message || req.body.message || 'done.';
  	res.status(200).send(message);
  })
  .catch((e)=>{
  	res.status(500).send(e);
  })

};




