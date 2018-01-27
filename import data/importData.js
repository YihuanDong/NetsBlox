var csv = require("fast-csv");
var fs = require("fs");
var Promise = require("promise");
var MongoClient = require("mongodb").MongoClient;
var MongoURI = "mongodb://localhost:27017/admin"

var stream = fs.createReadStream("dataset.csv");
var dataset = [];
var collectionName = "dataset";


importDataFromCSV(stream).then(() => {
    MongoClient.connect(MongoURI).then(db => {
        db.dropCollection(collectionName).catch(error => {
            console.log(error);
        });
        var collection = db.collection(collectionName);
        collection.insertMany(dataset).then(() => {
            console.log("import complete.");
            db.close();
        });           
    });
});

function importDataFromCSV(stream) {
    // read data
    var promise = new Promise((resolve, reject) => {
        csv.fromStream(stream, {headers: true, trim: true})
        .on ("data", data => {
            dataset.push(data);
        })
        .on ("end", () => {
            for (let i = 0; i < dataset.length; i++) {
                for (let key in dataset[i]) {
                    if (key.toLowerCase() != "state name") {
                        //dataset[i][key] = parseFloat(dataset[i][key]).toFixed(2);
                        dataset[i][key] = parseInt(dataset[i][key]);
                    }
                    else {
                        dataset[i][key] = dataset[i][key].toLowerCase();
                    }
                }
            }
            resolve();
        });
    });

    return promise;
}
