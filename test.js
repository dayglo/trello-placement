const util = require('util')
const _ = require('lodash')
const date = require('date-fns')
const chalk = require("chalk")
const fs = require('fs')

const crypto = require('crypto');

const fsWriteFile = util.promisify(fs.writeFile);
const fsReadFile = util.promisify(fs.readFile);

const { createCanvas, loadImage } = require('canvas')

const trello = require ('./trello.js')

let log = console.log;
let echo = (x) => {console.log(JSON.stringify(x,null,2))}
let title = (x) => {console.log(chalk.red(x + "\n---------------------------------------------------------------------"))}

if (!("TRELLO_BOARD_ID" in process.env)) {
    console.log('No TRELLO_BOARD_ID has been set.');
    process.exit(1)
}

if (!("BILLING_REPORT_CARD" in process.env)) {
    console.log('No BILLING_REPORT_CARD has been set.');
    process.exit(1)
}

if (!("MOVE_REPORT_CARD" in process.env)) {
    console.log('No MOVE_REPORT_CARD has been set.');
    process.exit(1)
}

if (!("STARTERS_REPORT_CARD" in process.env)) {
    console.log('No STARTERS_REPORT_CARD has been set.');
    process.exit(1)
}



let boardId = process.env.TRELLO_BOARD_ID || "n6VBFMpa"



let projectNameForName = (cardName) => {
		let matches = cardName.match(/^((p|P)roject|PROJECT)\s.\s([\w\s]+)()/) 

		if (matches) {
			return {
				replaced: true,
				name: matches[3].trim()
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
			let cardData = await trello.getAllBoardData(boardId)
			let lists = await trello.getLists()
			let listsAndCards = await trello.addCards(lists, cardData, ["Project Start Date", "SC","Not SC Eligible", "Skills", "Placement", "Role"])

			let listsAndCards2 = listsAndCards.map(l => {

				let result = projectNameForName(l.name)

				if (_.includes(["Reports", "Done", "Actions", "Recruitment"],l.name) ){
					//List is a system list
					l.system = true
				} else if (result.replaced) {
					// List is a Billable project
					l.projectName = result.name
					l.project = true
				} else {
					l.internal = true
				}

				return l

			})

			title("cleaned data")
			echo(listsAndCards2)

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Billing Report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let billingReportCardId = process.env.BILLING_REPORT_CARD || 'XbIkyoda'
			
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
						outputReport.totals.placed,
						outputReport.totals.pendingStartDate,
						outputReport.totals.internal,
						outputReport.totals.onsiteNonBilling,
					),
					"billing-" + dateString,
					1200,
					600
				)[0]

				let attachments = await trello.getAttachments(billingReportCardId)
				let newAttachment = await trello.uploadAttachment(imageLocation, billingReportCardId)
				
				log ("deleting " + attachments.data.length + " old attachments")
				await Promise.all(
					attachments.data.map(a => {
						return trello.deleteAttachment(billingReportCardId, a.id)
					})
				)

				await trello.updateCard(billingReportCardId,{
					desc: formatDescription(outputReport),
					idAttachmentCover: newAttachment.id
				})

				await fsWriteFile("/tmp/billingReport.txt", reportHash, "utf8")
			}

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Move report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let moveReportCardId = process.env.MOVE_REPORT_CARD || 'o5RSYrsE'

			let manualMoveReports = await trello.getFinalMovesForPeriod(boardId, cardData, projectNameForName,7)

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
					20 + (300 * manualMoveReports.length)
				)[0]

				attachments = await trello.getAttachments(moveReportCardId)
				newAttachment = await trello.uploadAttachment(moveReportImageLocation, moveReportCardId)
				
				log ("deleting " + attachments.data.length + " old attachments")
				await Promise.all(
					attachments.data.map(a => {
						return trello.deleteAttachment(moveReportCardId, a.id)
					})
				)

				await trello.updateCard(moveReportCardId,{
					desc: formatDescription(manualMoveReports),
					idAttachmentCover: newAttachment.id
				})
				
				await fsWriteFile("/tmp/moveReport.txt", reportHash, "utf8")
			}

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Starter report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			let starterReportCardId = process.env.STARTERS_REPORT_CARD || 'WRU9n5sv'

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
					20 + (300 * starterReport.length)
				)[0]

				attachments = await trello.getAttachments(starterReportCardId)
				if (attachments.length > 0) {
					debugger
				}

				newAttachment = await trello.uploadAttachment(starterReportImageLocation, starterReportCardId)
				
				log ("deleting " + attachments.data.length + " attachments")
				let results = await Promise.all(
					attachments.data.map(a => {
						return trello.deleteAttachment(starterReportCardId, a.id)
					})
				)

				await trello.updateCard(starterReportCardId,{
					desc: formatDescription(starterReport),
					idAttachmentCover: newAttachment.id
				})

				await fsWriteFile("/tmp/starterReport.txt", reportHash, "utf8")

			}

			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
			// Vacancy report
			// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
	
			let vacancyReportCardId = process.env.VACANCY_REPORT_CARD || 'yJvcPxXL'

			let vacancyReport = await getVacancyReport(listsAndCards2)
			title ("Vacancies coming up")
			echo(vacancyReport)

			reportHash = crypto.createHash('md5').update(JSON.stringify(vacancyReport)).digest('hex')

			if (reportHash == await readHash("/tmp/vacancyReport.txt")) {
				console.log("Vacancy Report: the hash is the same so don't re-update the board")
			} else {
				console.log("Vacancy report: re-update the board")

				let vacancyReportImageLocation = createImageFile(
					vacancyTextFn(vacancyReport),
					"vacancies-" + dateString,
					2400,
					40 + (250 * vacancyReport.length)
				)[0]

				attachments = await trello.getAttachments(vacancyReportCardId)
				if (attachments.length > 0) {
					debugger
				}

				newAttachment = await trello.uploadAttachment(vacancyReportImageLocation, vacancyReportCardId)
				
				log ("deleting " + attachments.data.length + " attachments")
				let results = await Promise.all(
					attachments.data.map(a => {
						return trello.deleteAttachment(vacancyReportCardId, a.id)
					})
				)

				await trello.updateCard(vacancyReportCardId,{
					desc: formatDescription(vacancyReport),
					idAttachmentCover: newAttachment.id
				})

				await fsWriteFile("/tmp/vacancyReport.txt", reportHash, "utf8")

			}




			resolve("done")

		} catch (e) {
			reject (e)
		}
	})

}

let starterTextFn = (starters) => {
	return (rect, text )=>{
		let i = 20
		starters.forEach(move => {
			text(`${move.name}:`,	i,	 	10, "#22A", '60pt Menlo')
			text(`${move.to}`,		i,	 	1100, "#131", '60pt Menlo')
			let friendlyDate = date.formatDistanceToNow(date.parseISO(move.date), { addSuffix: true })

			text(`${friendlyDate}`,	i+100,	100, "#191", '60pt Menlo')
			i += 300
		})
	}
}

let vacancyTextFn = (vacancies) => {
	return (rect, text )=>{
		let i = 20

		vacancies.forEach(vacancy => {
			text(`${vacancy.client }:`,	i,	 	10, "#22A", '60pt Menlo')
			text(`${vacancy.name}`,		i,	 	900, "#131", '60pt Menlo')

			if (vacancy.startDate == null) {
				text(`No start date`,	i+100,	1100, "#E00", '60pt Menlo')

			} else {

				let friendlyDate = date.formatDistanceToNow(new Date(vacancy.startDate) , { addSuffix: true })
				text(`${friendlyDate}`,	i+100,	1100, "#191", '60pt Menlo')
				
			}
			i += 250
		})

		return i
	}
}

let movesTextFn = (moves) => {
	return (rect, text )=>{
		let i = 20
		moves.forEach(move => {
			text(`${move.name}:`,							i,			10, "#22A", '60pt Menlo')
			text(`${move.move.from} --> ${move.move.to}`,	i + 100,	200, "#A2A", '60pt Menlo')
			i += 300
		})
	}
}

let billingTextFn = (billing = 0, placed = 0, pendingStart = 0, internal = 0, onsiteNonBilling = 0) => {
	return (rect, text )=>{

		let nonBillingTotal = onsiteNonBilling + internal + pendingStart

		text(`Billing: ${billing} (${placed} placed)` , 		5,	 10, "#2A2", '60pt Menlo')

		text("Not Billing: " 		+ nonBillingTotal,			200, 10, "#E00", '60pt Menlo')
		text("Onsite: " 			+ onsiteNonBilling ,		310, 30, "#22A", '40pt Menlo')
		text("Pending Start: " 		+ pendingStart ,			390, 30, "#22A", '40pt Menlo')
		text("Internal Projects: " 	+ internal,					470, 30, "#F96", '40pt Menlo')

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

let getVacancyReport = async(listsAndCards)=>{
	let vacancies = []


	listsAndCards.forEach((list)=>{
		list.cards.forEach((card)=>{

			let include = false

			if (card["labels"]) {
				card.labels.forEach((label)=>{
					if (label.name == "Vacancy") {
						include = true
					} 
				})
			}

			if (include){

				let vacancy = {
					name: card.name,
					client: projectNameForName(list.name).name,
					startDate: null
				}


				if (card["customFieldItems"]) {
					card.customFieldItems.forEach((field)=>{
						if (field.name == "Project Start Date") {
							vacancy.startDate = Date.parse(field.value.date)
						} 
					})
				}

				vacancies.push(vacancy)
			}
		})
	})
	
	return _.sortBy(vacancies, ['projectStartDate'])

}


let getStarterReport = async(listsAndCards)=>{
	let starters = []

	listsAndCards.forEach((list)=>{
		list.cards.forEach((card)=>{

			let include = false

			if (  _.find(card.customFieldItems, ["name", "Role"])   ){
				include = true
			}

			if (card["labels"]) {
				card.labels.forEach((label)=>{
					if (label.name == "Leave Cover") {
						include = true
					} 

					if (label.name == "Backfill Option") {
						include = false
					}
				})
			}

			if (include){
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
			}
		})
	})

	return starters

}

let makeBillingReport = async (lists) => {

	let now = Date.now()

	let report = {
		perProject:[],
		totals:{
			placed:0,
			billing: 0,
			nonBilling: 0,
			pendingStartDate: 0,
			internal: 0,
			onsiteNonBilling: 0,
			vacancies: 0
		}
	}

	lists.forEach((list)=>{


		if (list["system"]) {
			// do nothing
		} else if (list["internal"]) {

			list.cards.forEach((card)=>{
				report.totals.internal++
			})

		} else if (list["project"]) {

			let projectTotals = {
				project: list.projectName,
				consultants: {
					placed: 0,
					billing: 0,
					nonBilling: 0,
					pendingStartDate: 0,
					onsiteNonBilling: 0,
					vacancies: 0
				}
			}

			list.cards.forEach((card=>{

				let billing = false;

				let nonBillingLabel = false;
				let vacancyLabel = false;
				let leaveCoverLabel = false;
				let backfillOptionLabel = false; 

				let pendingStartDate = false;
				let hasRoleField = false


				if (card["labels"]) {
					card.labels.forEach((label)=>{
						if (label.name == "Leave Cover") {
							leaveCoverLabel = true
						} 
						if (label.name == "non billing") {
							nonBillingLabel = true;
						} 

						if (label.name == "Vacancy") {
							vacancyLabel = true
						}

						if (label.name == "Backfill Option") {
							backfillOptionLabel = true
						}
					})
				}

				if (  _.find(card.customFieldItems, ["name", "Role"])  ){
					hasRoleField = true

				}

				if (vacancyLabel) {
					projectTotals.consultants.vacancies++
				} else if (backfillOptionLabel){
					//dont count
				}
				else {

					// A card represents a placed person.
					if (hasRoleField || leaveCoverLabel) {

						projectTotals.consultants.placed++

						billing = true
						if (nonBillingLabel) {
							billing = false
							projectTotals.consultants.onsiteNonBilling++
						}

						if (card["customFieldItems"]) {
							card.customFieldItems.forEach((field)=>{
								if (field.name == "Project Start Date") {
									let projectStartDate = Date.parse(field.value.date)
									if (date.compareAsc(Date.now(), projectStartDate) == -1) {
										billing = false
										pendingStartDate = true
										projectTotals.consultants.pendingStartDate++
									} 
								} 

							})
						}			
		
						if (billing) 						projectTotals.consultants.billing++
						if (!billing)						projectTotals.consultants.nonBilling++

					}

				}

		
			}))

			
			report.perProject.push(projectTotals)
		} 

	})

	let totals = report.perProject.reduce(
		(acc, project) => {
			acc.billing += project.consultants.billing	
			acc.nonBilling += project.consultants.nonBilling
			acc.placed += project.consultants.placed
			acc.pendingStartDate += project.consultants.pendingStartDate
			acc.onsiteNonBilling += project.consultants.onsiteNonBilling					
			return acc
		},
		report.totals
	)
	report.totals = totals

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




