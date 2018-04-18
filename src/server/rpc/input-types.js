// handles the incoming input arguments for the RPCs. Parses and validates the inputs based on the code docs for the functions
const _ = require('lodash');
const blocks2js = require('./blocks2js');
const BugReporter = require('../bug-reporter');

const GENERIC_ERROR = new Error(''); // don't add to the error msg generated by rpc-manager

const NB_TYPES = {
    Array: 'List',
    Object: 'Structured Data'
};

// converts a javascript type name into netsblox type name
function getNBType(jsType) {
    return NB_TYPES[jsType] || jsType;
}

const types = {
    'Number': input => {
        input = parseFloat(input);
        if (isNaN(input)) {
            throw GENERIC_ERROR;
        }
        return input;
    },

    'Date': input => {
        input = new Date(input);
        if (isNaN(input.valueOf())) {
            throw GENERIC_ERROR;
        }
        return input;
    },

    'Array': input => {
        if (!Array.isArray(input)) throw GENERIC_ERROR;
        return input;
    },

    'Latitude': input => {
        input = parseFloat(input);
        if (isNaN(input)) {
            throw GENERIC_ERROR;
        } else if (input < -90 || input > 90) {
            throw new Error('Latitude must be between -90 and 90.');
        }
        return input;
    },

    'Longitude': input => {
        input = parseFloat(input);
        if (isNaN(input)) {
            throw GENERIC_ERROR;
        } else if (input < -180 || input > 180) {
            throw new Error('Longitude must be between -180 and 180.');
        }
        return input;
    },

    // all Object types are going to be structured data (simplified json for snap environment)
    'Object': input => {
        // check if it has the form of structured data
        let isArray = Array.isArray(input);
        if (!isArray || !input.every(pair => pair.length === 2 || pair.length === 1)) {
            throw new Error('It should be a list of (key, value) pairs.');
        }
        input = _.fromPairs(input);
        return input;
    },

    'Function': (blockXml, ctx) => {
        try {
            let factory = blocks2js.compile(blockXml);
            let env = blocks2js.newContext();
            env.__start = function(project) {
                project.ctx = ctx;
            };
            let fn = factory(env);
            return fn;
        } catch(e) {
            BugReporter.reportPotentialCompilerBug(e, blockXml, ctx);
            throw GENERIC_ERROR;
        }
    },
};

module.exports = {
    parse: types,
    getNBType
};