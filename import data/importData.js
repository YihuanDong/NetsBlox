var csv = require("fast-csv");
var fs = require("fs");
var Promise = require("promise");
var MongoClient = require("mongodb").MongoClient;
var MongoURI = "mongodb://localhost:27017/admin"

var stream = fs.createReadStream("data.csv");
var dataset = [];


importDataFromCSV("dataset", stream);

function importDataFromCSV(collectionName, stream) {
    // read data
    var promise = new Promise((resolve, reject) => {
        csv.fromStream(stream, {headers: true})
        .on ("data", data => {
            dataset.push(data);
        })
        .on ("end", () => {
            for (let i = 0; i < dataset.length; i++) {
                for (let value in dataset[i]) {
                    if (value != "state name") {
                        dataset[i][value] = parseInt(dataset[i][value]);
                    }
                }
            }
            resolve();
        });
    });

    // import dataset into database
    promise.then(() => {
        MongoClient.connect(MongoURI).then(db => {
            db.dropCollection(collectionName).catch(error => {
                console.log(error.message);
            });
            var collection = db.collection(collectionName);
            collection.insertMany(dataset).then(() => {
                console.log("import complete.");
                db.close();
            });           
        });
        
    });
}
