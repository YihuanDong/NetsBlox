const csv = require("fast-csv");
const fs = require("fs");
const inputPath = process.argv[2];

// input file requirement: 
// - csv file
// - First two columns: name, school

if (!inputPath || inputPath == undefined) {
    console.log("Error: no input file provided!");
    process.exit(1);
}

if (!fs.existsSync(inputPath)) {
    console.log("Error: the input file (" + inputPath + ") does not exist!");
    process.exit(1);
}

var inputStream = fs.createReadStream(inputPath);
var dataset = [];

importData();

function importData() {
    csv.fromStream(inputStream, {headers: true})
    .on("data", data => {
        dataset.push(data);
        console.log(data);
    })
    .on("end", createScript);
}

function createScript() {
    var outputStream = fs.createWriteStream("./createUser.sh");
    outputStream.write("#!/bin/sh\n");
    for (let i = 0; i < dataset.length; i++) {
        var line = '../bin/netsblox add-user "' + dataset[i].name + 
        '" "' + dataset[i].school + '" "' + dataset[i].name + '"\n';
        outputStream.write(line);
    }

    outputStream.end();
    console.log("Done!");
}