const util = require('util')
const _ = require('lodash')
const date = require('date-fns')
const chalk = require("chalk")
const fs = require('fs')

const crypto = require('crypto');

const fsWriteFile = util.promisify(fs.writeFile);
const fsReadFile = util.promisify(fs.readFile);

const { createCanvas, loadImage, registerFont } = require('canvas')



// const sheets = require ('./sheets.js')

let log = console.log;
let echo = (x) => {console.log(JSON.stringify(x,null,2))}
let title = (x) => {console.log(chalk.red(x + "\n---------------------------------------------------------------------"))}


if (!("TRELLO_TOKEN" in process.env)) {
    console.log('No TRELLO_TOKEN has been set.');
    process.exit(1)
}

if (!("TRELLO_KEY" in process.env)) {
    console.log('No TRELLO_KEY has been set.');
    process.exit(1)
}

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

if (!("CANDIDATE_REPORT_CARD" in process.env)) {
    console.log('No CANDIDATE_REPORT_CARD has been set.');
    process.exit(1)
}

if (!("VACANCY_REPORT_CARD" in process.env)) {
    console.log('No VACANCY_REPORT_CARD has been set.');
    process.exit(1)
}

let trelloToken = process.env.TRELLO_TOKEN
let trelloKey = process.env.TRELLO_KEY



let boardId = process.env.TRELLO_BOARD_ID || "n6VBFMpa"

let trello = require('./trello.js')({trelloToken, trelloKey, trelloBoardId: boardId })

//registerFont('Barlow-Medium.ttf', { family: 'Barlow' })

let projectNameForName = (cardName) => {
    let matches = cardName.match(/^((p|P)roject|PROJECT)\s.\s([\w\s]+) *(\(.+\))*/) 

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
            let allBoardData = await trello.getAllBoardData(["Project Start Date", "Project End Date", "SC","Not SC Eligible", "Skills", "Role", "Placement"])

            let projectListData = allBoardData.map(l => {

                let result = projectNameForName(l.name)

                l.projectName = result.name
                if (_.includes(["Reports", "Done", "Actions", "Recruitment", "Tests","Unrequired Confirmed Vacancies"],l.name) ){
                    //List is a system list
                    l.system = true
                } else if (result.replaced) {
                    l.project = true
                } else {
                    l.internal = true
                }

                return l

            })

            // title("cleaned data")
            // echo(projectListData)


            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            // Billing Report
            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            
            let billingReportCardId = process.env.BILLING_REPORT_CARD || 'XbIkyoda'
            
            let outputReport = await makeNewBillingReport(projectListData)
            title("Billing Report")
            echo(outputReport)

            let reportHash = crypto.createHash('md5').update(JSON.stringify(outputReport)).digest('hex')
            
            if (reportHash == await readHash("/tmp/billingReport.txt")) {
                console.log("Billing report: the hash is the same so don't re-update the board")
            } else {
                console.log("Billing report: re-update the board")

                let imageLocation = createImageFile(
                    billingTextFn(
                        outputReport.totals
                    ),
                    "billing-" + dateString,
                    1400,
                    3000
                )[0]

                let attachments = await trello.getAttachments(billingReportCardId)
                let newAttachment = await trello.uploadAttachment(imageLocation, billingReportCardId)
                
                log ("deleting " + attachments.data.length + " old attachments")
                Promise.all(
                    attachments.data.map(a => {
                        return trello.deleteAttachment(billingReportCardId, a.id)
                    })
                )

                trello.updateCard(billingReportCardId,{
                    desc: formatDescription(outputReport.totals),
                    idAttachmentCover: newAttachment.id
                })

                fsWriteFile("/tmp/billingReport.txt", reportHash, "utf8")

                //sheets.write(boardId , outputReport)

            }

            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            // Candidate Report
            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            let candidateReportCardId = process.env.CANDIDATE_REPORT_CARD || 'j2glwngA'
            
            let candidateList = await getCandidateList(projectListData)

            title("Candidate Report")
            echo(candidateList)
            reportHash = crypto.createHash('md5').update(JSON.stringify(candidateList)).digest('hex')

            if (reportHash == await readHash("/tmp/candidateReport.txt")) {
                console.log("Candidate report: the hash is the same so don't re-update the board")
            } else {
                console.log("Candidate report: re-update the board")

                let imageLocation = createImageFile(
                    candidateTextFn(candidateList),
                    "candidate-" + dateString,
                    2400,
                    40 + (250 * candidateList.length)
                )[0]

                attachments = await trello.getAttachments(candidateReportCardId)
                newAttachment = await trello.uploadAttachment(imageLocation, candidateReportCardId)
                
                log ("deleting " + attachments.data.length + " old attachments")
                Promise.all(
                    attachments.data.map(a => {
                        return trello.deleteAttachment(candidateReportCardId, a.id)
                    })
                )

                trello.updateCard(candidateReportCardId,{
                    desc: formatDescription(candidateList),
                    idAttachmentCover: newAttachment.id,
                    name: `Candidates (${candidateList.length})`
                })

                fsWriteFile("/tmp/candidateReport.txt", reportHash, "utf8")
            }


            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            // Move report
            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            let moveReportCardId = process.env.MOVE_REPORT_CARD || 'o5RSYrsE'

            let cardData = await trello.getAllBoardCards()

            let manualMoveReports = await trello.getFinalMovesForPeriod(cardData, projectNameForName,7)

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
                Promise.all(
                    attachments.data.map(a => {
                        return trello.deleteAttachment(moveReportCardId, a.id)
                    })
                )

                trello.updateCard(moveReportCardId,{
                    desc: formatDescription(manualMoveReports),
                    idAttachmentCover: newAttachment.id,
                    name: `Manual Moves this week (${manualMoveReports.length})`
                })
                
                fsWriteFile("/tmp/moveReport.txt", reportHash, "utf8")
            }

            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            // Starter report
            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            let starterReportCardId = process.env.STARTERS_REPORT_CARD || 'WRU9n5sv'

            let starterReport = await getStarterReport(projectListData)
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
                Promise.all(
                    attachments.data.map(a => {
                        return trello.deleteAttachment(starterReportCardId, a.id)
                    })
                )

                trello.updateCard(starterReportCardId,{
                    desc: formatDescription(starterReport),
                    idAttachmentCover: newAttachment.id,
                    name: `Upcoming Starters (${starterReport.length})`
                })

                fsWriteFile("/tmp/starterReport.txt", reportHash, "utf8")

            }

            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
            // Vacancy report
            // -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    
            let vacancyReportCardId = process.env.VACANCY_REPORT_CARD || 'yJvcPxXL'

            let vacancyReport = await getVacancyReport(projectListData)
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
                Promise.all(
                    attachments.data.map(a => {
                        return trello.deleteAttachment(vacancyReportCardId, a.id)
                    })
                )

                trello.updateCard(vacancyReportCardId,{
                    desc: formatDescription(vacancyReport),
                    idAttachmentCover: newAttachment.id,
                    name: `Vacancies (${vacancyReport.length})`
                })

                fsWriteFile("/tmp/vacancyReport.txt", reportHash, "utf8")

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
            text(`${move.name}:`,   i,      10, "#22A", '60pt Barlow')
            text(`${move.to}`,      i,      1100, "#131", '60pt Barlow')
            let friendlyDate = date.formatDistanceToNow(date.parseISO(move.date), { addSuffix: true })

            text(`${friendlyDate}`, i+100,  100, "#191", '60pt Barlow')
            i += 300
        })
    }
}

let vacancyTextFn = (vacancies) => {
    return (rect, text )=>{
        let i = 20

        vacancies.forEach(vacancy => {
            text(`${vacancy.client }:`, i,      10, "#22A", '60pt Barlow')
            text(`${vacancy.name}`,     i,      900, "#131", '60pt Barlow')

            if (vacancy.startDate == null) {
                text(`No start date`,   i+100,  900, "#ae017e", '60pt Barlow')

            } else {

                let startDate = new Date(vacancy.startDate) 
                let color = "#191"

                switch (date.compareAsc(Date.now(), startDate)) {

                    case 1:
                        // Date has passed
                        color = "#bd0026"
                    break;

                    case 0:
                        // Today's date
                        color = "#990000"
                    break;

                    case -1:

                        let daysFromNow = date.differenceInDays(startDate,Date.now())

                        if (daysFromNow <= 7){
                            //imminent
                            color = "#990000"
                        }
                        else if (daysFromNow <= 14) {
                            color = "#d7301f"
                        }
                        else if (daysFromNow <= 28) {
                            color = "#ef6548"
                        }
                        else if (daysFromNow <= 28 * 2) {
                            color = "#41ae76"
                        }
                        else if (daysFromNow <= 28 * 3) {
                            color = "#238b45"
                        }
                        else if (daysFromNow <= 28 * 4) {
                            color = "#31a354"
                        }
                        else {
                            color = "#005824"
                        }

                    break;
                }

                let friendlyDate = date.formatDistanceToNow(startDate, { addSuffix: true })
                text(`${friendlyDate}`, i+100,  900, color, '60pt Barlow')
                
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
            text(`${move.name}:`,                           i,          10, "#22A", '60pt Barlow')
            text(`${move.move.from} --> ${move.move.to}`,   i + 100,    200, "#A2A", '60pt Barlow')
            i += 300
        })
    }
}

let billingTextFn = (totals) => {

    let {onProject, offProject, vacancies} = totals

    return (rect, text )=>{
        text(`On Project:`,                       5,                  10,  "#2A2", '60pt Barlow')
        text( `${onProject.total}` ,              5,                  900, "#2A2", '60pt Barlow')
        text(`Billable:`,                         115,                200, "#22A", '40pt Barlow')
        text( `${onProject.billable}`,            115,                900, "#22A", '40pt Barlow')
        text(`Non Billable:`,                     195,                200, "#22A", '40pt Barlow')
        text( `${onProject.nonBillable}`,         195,                900, "#22A", '40pt Barlow')
        text(`Contractors:`,                      275,                200, "#22A", '40pt Barlow')
        text( `${onProject.contractors}`,         275,                900, "#22A", '40pt Barlow')
        text(`Permanent:`,                        355,                200, "#22A", '40pt Barlow')
        text( `${onProject.permanent}`,           355,                900, "#22A", '40pt Barlow')
        text(`Off Project:`,                      200 + 360,          10,  "#E00", '60pt Barlow')
        text( `${offProject.total}`,              200 + 360,          900, "#E00", '60pt Barlow')
        text(`Lab/GCE:`,                          310 + 360,          200, "#22A", '40pt Barlow')
        text( `${offProject.lab.GCE}`,            310 + 360,          900, "#22A", '40pt Barlow')
        text(`Lab/Non Academy:`,                  390 + 360,          200, "#22A", '40pt Barlow')
        text( `${offProject.lab.nonAcademy}`,     390 + 360,          900, "#22A", '40pt Barlow')
        text(`Define:`,                           470 + 360,          200, "#F96", '40pt Barlow')
        text( `${offProject.define}`,             470 + 360,          900, "#F96", '40pt Barlow')

        text(`Vacancies:`,                                      200 + 360 + 500,    10,  "#000", '60pt Barlow')
        text( `${vacancies.total}`,                             200 + 360 + 500,    900, "#000", '60pt Barlow')
        text(`New Business:`,                                   310 + 360 + 500,    200, "#22A", '50pt Barlow')
        text( `${vacancies.newBusiness.total}`,                 310 + 360 + 500,    900, "#22A", '50pt Barlow')
        text(`Filled:`,                                         390 + 360 + 500,    350, "#22A", '40pt Barlow')
        text( `${vacancies.newBusiness.filled.total}`,          390 + 360 + 500,    900, "#22A", '40pt Barlow')
        text(`Pending Start:`,                                  450 + 360 + 500,    450, "#22A", '30pt Barlow')
        text( `${vacancies.newBusiness.filled.pendingStart}`,   450 + 360 + 500,    900, "#22A", '30pt Barlow')
        text(`Late:`,                                           530 + 360 + 500,    450, "#22A", '30pt Barlow')
        text( `${vacancies.newBusiness.filled.late}`,           530 + 360 + 500,    900, "#22A", '30pt Barlow')
        text(`Unfilled:`,                                       620 + 360 + 500,    350, "#F96", '40pt Barlow')
        text( `${vacancies.newBusiness.unfilled}`,              620 + 360 + 500,    900, "#F96", '40pt Barlow')

        text(`Backfill:`,                                       310 + 360 + 1000,   200, "#22A", '50pt Barlow')
        text( `${vacancies.backfill.total}`,                    310 + 360 + 1000,   900, "#22A", '50pt Barlow')
        text(`Filled:`,                                         390 + 360 + 1000,   350, "#22A", '40pt Barlow')
        text( `${vacancies.backfill.filled.total}`,             390 + 360 + 1000,   900, "#22A", '40pt Barlow')
        text(`Pending Start:`,                                  450 + 360 + 1000,   450, "#22A", '30pt Barlow')
        text( `${vacancies.backfill.filled.pendingStart}`,      450 + 360 + 1000,   900, "#22A", '30pt Barlow')
        text(`Late:`,                                           530 + 360 + 1000,   450, "#22A", '30pt Barlow')
        text( `${vacancies.backfill.filled.late}`,              530 + 360 + 1000,   900, "#22A", '30pt Barlow')
        text(`Unfilled:`,                                       620 + 360 + 1000,   350, "#F96", '40pt Barlow')
        text( `${vacancies.backfill.unfilled}`,                 620 + 360 + 1000,   900, "#F96", '40pt Barlow')

    }
}


let candidateTextFn = (candidates) => {
    return (rect, text )=>{
        let i = 20

        candidates.forEach(candidate => {
            text(`${candidate.name}(${candidate.moveScore}) @ ${candidate.currentClient}`,  i,      10, "#22A", '40pt Barlow')
            text(`${candidate.reasons}`,                                                    i+100,  100,"#E00", '40pt Barlow')

            i += 250
        })

        return i
    }
}

let createImageFile = (drawFn, outputFileName, width = 1200, height = 580)=>{

    const padding = 30
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')

    //Set background
    context.fillStyle = "#222222"
    context.fillRect(0,0,width,height)

    let rect = (top, height, color = '#3A3') => {
        context.fillStyle = color
        context.fillRect(padding, top + padding, width - (padding * 2), height - (padding * 2))
    }

    let text = (text, top = 0, left = 0, color = '#EEE', font  = '100pt Barlow') => {
        // log("WOOOOOO: "  + left)
        let myHeight = context.measureText(text).height
        context.fillStyle = color
        context.font = font
        context.fillText(text, left + padding, top + padding + 70)
    }
    //Main pane
    rect(0,height,"#fcfeff")

    drawFn(rect, text)

    const buffer = canvas.toBuffer('image/png')
    let fileName = `/tmp/generated-report-${outputFileName}.png` 
    fs.writeFileSync(fileName, buffer)
    return [fileName, buffer]

}


let getCandidateList = (listsAndCards)=>{

    //show all people with either 1) a end-date that is soon; 2) a 'candidate-to-move' label 3) a start date longer than a year ago. 4) new hire label. 5) A positive bumble lookup (in that order) 

    let candidates = []

    listsAndCards.forEach((list)=>{
        list.cards.forEach((card)=>{

            let include = false
            let reasons = []
            let moveScore = 0

            if (card["labels"]) {
                card.labels.forEach((label)=>{
                    if (label.name == "Candidate to Move") {
                        include = true
                        reasons.push( "is a 'candidate to move'")
                        moveScore += 50
                    }
                    if (label.name == "New Joiner") {
                        include = true
                        reasons.push( "is a 'new joiner'")
                        moveScore += 100
                    } 
                })
            }

            if (card["customFieldItems"]) {
                card.customFieldItems.forEach((field)=>{
                    if (field.name == "Project Start Date") {
                        let daysTooLong = 365 * 2
                        let projectStartDate = date.parseISO(field.value.date)
                        // if the date a year ago is after the start date that means theyve been there over a year
                        if (date.compareAsc( date.subDays(new Date(),daysTooLong) ,projectStartDate) == 1) {
                            include = true
                            reasons.push( "has a start date over two years ago")
                            moveScore += 20
                        }
                    }

                    if (field.name == "Project End Date") {
                        let projectEndDate = date.parseISO(field.value.date)
                        // if today is after the person's end date minus a month 
                        if (date.compareAsc(new Date(), date.subWeeks(projectEndDate,4) ) == 1) {
                            include = true
                            reasons.push( "has an end date that is soon")
                            moveScore += 20
                        }
                    }

                    if (field.name == "Skills") {
                        let skills = ""
                    }


                })
            }

            if (include){

            let candidate = {
                name: card.name,
                currentClient: projectNameForName(list.name).name,
                reasons: reasons.join(", "),
                moveScore: moveScore
            }



            candidates.push(candidate)
            }
        })
    })
    
    return _.orderBy(candidates, ['moveScore'],['desc'])


    
}


let getVacancyReport = async(listsAndCards)=>{
    let vacancies = []


    listsAndCards.forEach((list)=>{
        list.cards.forEach((card)=>{

            let include = false

            if (card["labels"]) {
                card.labels.forEach((label)=>{
                    if (label.name.match(/^Vacancy/)) {
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
    
    return _.sortBy(vacancies, ['startDate'])

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

                    if (label.name.match(/^Vacancy/)) {
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

let hasLabel = (card, labelName) =>{

    if (card["labels"]) {
        let labelFound = false

        card.labels.forEach((label)=>{
            if (label.name == labelName) {
                labelFound = true
            }
        })

        return labelFound
    }
    else {
        return false
    }

}


let matchLabel = (card, labelString) =>{

    if (card["labels"]) {
        let labelMatched = false

        card.labels.forEach((label)=>{
            if (label.name.match(`${labelString}`)) {
                labelMatched = true
            }
        })

        return labelMatched
    }
    else {
        return false
    }

}

let makeHierarchicalBillingReport = async (lists) => {

    let data = {
        onProject:{
            billing:{
                permanent:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                },
                contract:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                }
            },
            nonBilling:{
                permanent:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                },
            },
        },
        offProject:{
            lab:{
                permanent:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                },
                contract:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                }
            },
            define:{
                permanent:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                },
                contract:{
                    engineering:{},
                    delivery:{},
                    uncategorised:{}
                },

            },

        },
    }
    
    let addToRoleBreakDown = (breakdown, role, name, value) => {
        let lookup = () => {
            let table = {
                unset:  "uncategorised",
                GCE:    "engineering",
                JCE:    "engineering",
                CE:     "engineering",
                SCE:    "engineering",
                SDM:    "delivery",
                DM:     "delivery",
                JDM:    "delivery",
            }

            let result = table[role];

            if (typeof result === "undefined") {
                if (role.match(/CE$/)) {
                    return "engineering"
                } else if (role.match(/DM$/)) {
                    return "delivery"
                } else {
                    return "uncategorised"
                }
            } else {
                return result
            }
        }

        let type = lookup()

        if (typeof breakdown[type][role] === "undefined") {
            breakdown[type][role] = []
        }

        breakdown[type][role].push({name,value})

    }


    lists.forEach((list)=>{
        list.cards.forEach((card)=>{

            //if doesnt have role card and isnt a vacancy card, ignore
            if ( matchLabel(card,"^Vacancy") ) {
                
            } else {
                let hasRoleField = _.find(card.customFieldItems, ["name", "Role"]) 

                if ( hasRoleField ){

                    let role = _.find(card.customFieldItems, ["name", "Role"]).value.text

                    let contractor = hasLabel(card,"Contractor")
                    let billing = !(hasLabel(card,"Non Billing"))

                    let formattedName = `${card.name} [${card.list.name}]`

                    if (list["system"]) {
                        // do nothing
                    } else {
                        if (list["project"]) {
                            //onProject

                            if (contractor){
                                if (billing){
                                    addToRoleBreakDown(data.onProject.billing.contract, role, formattedName, 1)
                                } else {
                                    addToRoleBreakDown(data.onProject.nonBilling.contract, role, formattedName, 1)
                                }
                            } else {
                                if (billing){
                                    addToRoleBreakDown(data.onProject.billing.permanent, role, formattedName, 1)
                                } else {
                                    addToRoleBreakDown(data.onProject.nonBilling.permanent, role, formattedName, 1)
                                }
                            }


                        } else if (list["internal"]) {

                            let define = list["name"].startsWith("Define")

                            if (contractor){
                                if (define) {
                                    addToRoleBreakDown(data.offProject.define.contract, role, formattedName, 1)
                                } else {
                                    addToRoleBreakDown(data.offProject.lab.contract, role, formattedName, 1)
                                }
                            } else {
                                if (define){
                                    addToRoleBreakDown(data.offProject.define.permanent, role, formattedName, 1)
                                } else {
                                    addToRoleBreakDown(data.offProject.lab.permanent, role, formattedName, 1)
                                }
                            }


                        }
                    }
                }
            }
        }) 
    })

    return data
}


let makeNewBillingReport =  (data, today) => {

    try{

        let lists = data.reduce((acc, l) => {

            let result = projectNameForName(l.name)

            l.projectName = result.name
            if (_.includes(["Reports", "Done", "Actions", "Recruitment", "Tests", "Unrequired Confirmed Vacancies"],l.name) ){
                //List is a system list
                l.system = true
            } else if (result.replaced) {
                l.project = true
                acc.push(l)
            } else {
                l.internal = true
                acc.push(l)
            }

            return acc

        },[])


        if (!today) {
            today = new Date(new Date().setHours(0,0,0,0))
        } else {
            today.setHours(0,0,0,0)
        }

        let report = {
            projects:[],

            totals:{
                onProject:{
                    total: 0,
                    billable: 0,
                    nonBillable: 0,
                    contractors: 0,
                    permanent: 0,
                },
                offProject:{
                    total: 0,
                    lab:{
                        total: 0,
                        GCE: 0,
                        nonAcademy: 0
                    },
                    define: 0,
                },
                vacancies:{
                    total: 0,
                    newBusiness:{
                        total:0,
                        filled:{
                            pendingStart:0,
                            late:0
                        },
                        unfilled:0,
                    },
                     backfill:{
                        total:0,
                        filled:{
                            pendingStart:0,
                            late:0,
                        },
                        unfilled:0,
                    }
                }
            }
        }


        lists.forEach((list)=>{

            let includeThisList = false;

            let projectTotals = {
                project: list.projectName,
                projectType: null,
                consultants: {
                    total: 0,
                    billable: 0,
                    nonBillable: 0,
                    contractors: 0,
                    permanent: 0,
                    newJoinersNotStartedYet: 0,
                    roles:{
                        levels:{
                            SCE: 0
                        },
                        nonAcademy: 0,
                        define: 0,
                    }
                },
                vacancies:{
                    total: 0,
                    newBusiness:{
                        total:0,
                        filled:{
                            pendingStart:0,
                            late:0,
                        },
                        unfilled:0,
                    },
                    backfill:{
                        total:0,
                        filled:{
                            pendingStart:0,
                            late:0,
                        },
                        unfilled:0,
                    }
                }

            }


            let getCardVacancyData = (card) => {

                let output = {
                    filled: {
                        pendingStart:0,
                        late:0,
                    },
                    unfilled:0,
                }

                let projectStartDate = getCustomField(card, "Project Start Date")
                let projectEndDate =   getCustomField(card, "Project End Date")

                let placement = ""
                let placementText = placement
                let placementMade = false
                let placementCustomField = _.find(card.customFieldItems, ["name", "Placement"])

                if (placementCustomField){
                    placement = placementCustomField.value.text
                }

                if (placement.match( /^[0-9a-f]{24,32}$/ )) {
                    otherCard = findCard(lists, placement)
                    let otherCardPlacement = getCustomField(otherCard, "Placement")

                    placementMade = ( (otherCard.id == placement )  &&  (card.id == otherCardPlacement) )
                }

                let placementStartDate = "" 
                let placementEndDate = ""
                let placementStatus = ""
                let vacancyStatus = ""

                if (placementMade) {
                    output.total = 1

                    placementStartDate =  projectStartDate
                    placementEndDate =  projectEndDate
                    placementStatus = (date.compareAsc(today, placementStartDate) == 1 ) ? "placed-late" : "placed-pending-start" 

                    if (placementStatus == "placed-late") {
                        output.filled.late = 1
                    } else if (placementStatus == "placed-pending-start") {
                        output.filled.pendingStart = 1
                    }
                    
                    placementText = `${projectNameForName(otherCard.list.name).name}/${otherCard.name}`
                } else {
                    output.unfilled = 1
                }
                return output
            }


            list.cards.forEach((card)=>{

                let vacancyType = false
                if (hasLabel(card,"Vacancy(Backfill)")) {
                    vacancyType = "backfill"
                } else if (hasLabel(card,"Vacancy")) {
                    vacancyType = "newBusiness"
                }

                
                if (vacancyType !== false) {
                    // Count vacancies
                    if (list["project"]) {
                        cardVacancyData = getCardVacancyData(card)

                        projectTotals.vacancies.total++
                        projectTotals.vacancies[vacancyType].total++
                        projectTotals.vacancies[vacancyType].filled.pendingStart += cardVacancyData.filled.pendingStart
                        projectTotals.vacancies[vacancyType].filled.late +=         cardVacancyData.filled.late
                        projectTotals.vacancies[vacancyType].unfilled +=            cardVacancyData.unfilled 

                    }
                } else {
                    // count people 
                    let hasRoleField = _.find(card.customFieldItems, ["name", "Role"]) 

                    if ( hasRoleField ){

                        let role = _.find(card.customFieldItems, ["name", "Role"]).value.text

                        let newJoiner = hasLabel(card, "New Joiner")
                        let projectStartDate = getCustomField(card, "Project Start Date")

                        if (newJoiner && date.isBefore(today,projectStartDate) ){
                            projectTotals.consultants.newJoinersNotStartedYet++

                        } else {

                            if (list["system"]) {
                                // do nothing
                            } else {

                                includeThisList = true

                                if (typeof projectTotals.consultants.roles.levels[role] !== "number" ){
                                    projectTotals.consultants.roles.levels[role] = 0
                                }

                                projectTotals.consultants.roles.levels[role]++

                                projectTotals.consultants.total++

                                if (list["internal"]) {
                                    //offProject
                                    projectTotals.projectType = "internal"

                                    if (list["name"].startsWith("Define")) {
                                        projectTotals.consultants.roles.define++

                                    } else {
                                        if (role !== "GCE") {
                                            projectTotals.consultants.roles.nonAcademy++
                                        } 
                                    }


                                } else if (list["project"]) {
                                    //onProject
                                    projectTotals.projectType = "client"

                                    if (hasLabel(card,"Contractor")){
                                        projectTotals.consultants.contractors++
                                    } else {
                                        projectTotals.consultants.permanent++
                                    }

                                    if (hasLabel(card,"Non Billing")){
                                        projectTotals.consultants.nonBillable++
                                    } else {
                                        projectTotals.consultants.billable++
                                    }
                                }

                            }
                        }
                    }

                }

            }) 

            if (includeThisList) report.projects.push(projectTotals)

        })

        let totals = report.totals

        report.projects.forEach(project => {

            if (project.projectType == "internal"){
                //off project

                totals.offProject.total +=  project.consultants.total

                if (project.consultants.roles.define > 0) {
                    //define
                    totals.offProject.define += project.consultants.roles.define
                } else {
                    //lab
                    totals.offProject.lab.total += project.consultants.total
                    if (typeof project.consultants.roles.levels["GCE"] === "number") {
                        totals.offProject.lab.GCE += project.consultants.roles.levels.GCE
                    }

                    for (const [level, count] of Object.entries(project.consultants.roles.levels)) {
                        if (level !== "GCE"){
                            totals.offProject.lab.nonAcademy += count
                        }
                    }
                }

            } else if (project.projectType == "client"){
                //on project
                totals.onProject.total              += project.consultants.total
                totals.onProject.billable           += project.consultants.billable
                totals.onProject.nonBillable        += project.consultants.nonBillable
                totals.onProject.contractors        += project.consultants.contractors
                totals.onProject.permanent          += project.consultants.permanent
            
                //vacancies
                totals.vacancies.total              += project.vacancies.total
                _.forEach(["newBusiness", "backfill"], (vacancyType)=>{
                    totals.vacancies[vacancyType].total               += project.vacancies[vacancyType].total
                    totals.vacancies[vacancyType].filled.pendingStart += project.vacancies[vacancyType].filled.pendingStart
                    totals.vacancies[vacancyType].filled.late         += project.vacancies[vacancyType].filled.late    
                    totals.vacancies[vacancyType].unfilled            += project.vacancies[vacancyType].unfilled           
                    
                    totals.vacancies[vacancyType].filled.total =     totals.vacancies[vacancyType].filled.pendingStart + totals.vacancies[vacancyType].filled.late            
                }) 
            }
        })

        report.totals = totals

        return report

    } catch (e) {
        console.error("Error while compiling Billing Summary " + e)
    }
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




var findCard = (trelloData,cardId)=>{
    let card = false
    trelloData.forEach(list=>{
        list.cards.forEach(c=>{
            if (c.id === cardId) {
                card = c
                return card
            }
        })
    })
    return card
} 

let getCustomField = (card,fieldName)=>{
    if (typeof card["customFieldItems"] === "undefined") {
        return false
    }

    let field = _.find(card.customFieldItems,["name",fieldName])

    if (typeof field === "undefined") {
        return false
    }

    if (typeof field.value === "undefined") {
        return false
    }

    if (typeof field.value.text !== "undefined") {
        return field.value.text
    }

    if (typeof field.value.date !== "undefined") {
        return new Date(field.value.date)
    }

    throw "Failed to look up custom field."
} 


