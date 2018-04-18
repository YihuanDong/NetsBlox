/**
 * The InvasiveSpecies Service provides access to real-world invasive species data.
 * For more information, check out https://www.nwf.org/Educational-Resources/Wildlife-Guide/Threats-to-Wildlife/Invasive-Species
 *
 * @service
 */
var csv = require("fast-csv");
var fs = require("fs");

var Storage = require("../../../storage/storage"),
    Logger = require("../../../logger"),
    logger = new Logger("netsblox:rpc:invasive-species"),
    storage = new Storage(logger),
    testStorage = require("../../storage"),
    collectionName = "dataset";

var dataset = {};

var stream = fs.createReadStream(__dirname + "/data.csv");

csv.fromStream(stream, {headers: true})
.on ("data", data => {
    var state = {};
    for (let key in data) {
        var newKey = key.trim().toLowerCase();
        if (newKey == 'state name') {
            state[newKey] = data[key].toLowerCase();
        }
        else {
            state[newKey] = parseInt(data[key]);
        }
    }
    dataset[state["state name"]] = state;
})
.on ("end", () => {
    console.log("Finished importing invasive species data!");
});

const InvasiveSpecies = {};

// It might be nice to reuse a single DB connection
/**
 * Get data about the given feature for the state.
 * @param {String} stateName State
 * @param {String} featureName Data to query
 */
InvasiveSpecies.getData = function(stateName, featureName) {
    stateName = stateName.trim().toLowerCase();
    featureName = featureName.trim().toLowerCase();

    if (dataset[stateName] == undefined) {
        throw new Error("State name: " + stateName + " does not exist!");
    }
    else if (dataset[stateName][featureName] == undefined) {
        throw new Error("Feature name: " + featureName + " does not exist!");
    }
    else {
        return dataset[stateName][featureName];
    }
}

/**
 * Get a list of all state names with data about invasive species.
 */
InvasiveSpecies.getStateNames = function() {
    return Object.keys(dataset);
}


module.exports = InvasiveSpecies;
