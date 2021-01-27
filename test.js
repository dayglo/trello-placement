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

let boardId = "n6VBFMpa"

let projectNameForName = (cardName) => {
		let matches = cardName.match(/^((p|P)roject|PROJECT)\s.\s(.+)/) 

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
			let cardData = await trello.getAllBoardData(boardId)
			let lists = await trello.getLists()
			let listsAndCards = await trello.addCards(lists, cardData, ["Project Start Date", "SC","Not SC Eligible", "Skills", "Employee ID", "Email"])

			let listsAndCards2 = listsAndCards.map(l => {

				let result = projectNameForName(l.name)

				if (l.name == "Reports"){
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
						outputReport.totals.placed,
						outputReport.totals.pendingStartDate,
						outputReport.totals.internal,
						outputReport.totals.onsiteNonBilling,
					),
					"billing-" + dateString,
					1200,
					700
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
			let moveReportCardId = 'o5RSYrsE'

			let manualMoveReports = await trello.getManualMoveActions(boardId, cardData, projectNameForName)
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

				attachments = await trello.getAttachments(starterReportCardId)
				newAttachment = await trello.uploadAttachment(starterReportImageLocation, starterReportCardId)
				
				log ("deleting " + attachments.data.length + " attachments")
				await Promise.all(
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
			text(`${move.name}:`,	i,	 10, "#22A", '60pt Menlo')
			text(`${move.to}`,	i,	 	900, "#491", '60pt Menlo')
			i += 200
		})
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

		text("Not Billing: " 		+ nonBillingTotal,			200, 10, "#F00", '60pt Menlo')
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

				let placed = true;
				let billing = true;
				let vacancy = false;
				let pendingStartDate = false;

				if (card["labels"]) {
					card.labels.forEach((label)=>{
						if (label.name == "non billing") {
							billing = false;
						} 

						if (label.name == "Vacancy") {
							vacancy = true
						}

					})
				}
				 
				if ((card["customFieldItems"] && !vacancy)) {
					card.customFieldItems.forEach((field)=>{
						if (field.name == "Project Start Date") {
							let projectStartDate = Date.parse(field.value.date)
							if (date.compareAsc(Date.now(), projectStartDate) == -1) {
								billing = false
								pendingStartDate = true
							} 
						} 

					})
				}

				if (!vacancy) {

					if (placed) 						projectTotals.consultants.placed++
					if (placed && !billing) 			projectTotals.consultants.onsiteNonBilling++
					if (placed && pendingStartDate) 	projectTotals.consultants.pendingStartDate++
	
					if (billing) 						projectTotals.consultants.billing++
					if (!billing)						projectTotals.consultants.nonBilling++

				} else {
					projectTotals.consultants.vacancies++
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




