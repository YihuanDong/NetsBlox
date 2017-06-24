// These are utils for server specific tasks
'use strict';

var R = require('ramda'),
    Q = require('q'),
    assert = require('assert'),
    debug = require('debug'),
    info = debug('netsblox:api:utils:info'),
    trace = debug('netsblox:api:utils:trace'),
    error = debug('netsblox:api:utils:error'),
    version = require('../../package.json').version;

const APP = `NetsBlox ${version}, http://netsblox.org`;

var uuid = function(owner, name) {
    return owner + '/' + name;
};

// Helpers for routes
var APP_REGEX = /app="([^"]+)"/;
var getRoomXML = function(project) {
    return project.getRoles()
        .then(roles => {
            roles.sort(role => role.ProjectName === project.activeRole ? -1 : 1);

            var roleXml = roles.map(role =>
                `<role name="${role.ProjectName}">${role.SourceCode + role.Media}</role>`
            ).join('');
            var app = roleXml.match(APP_REGEX)[1] || APP;

            return `<room name="${project.name}" app="${app}">${roleXml}</room>`;
        });
};

var serializeArray = function(content) {
    assert(content instanceof Array);
    return content.map(serialize).join(' ');
};

var serialize = function(service) {
    var pairs = R.toPairs(service);
    return encodeURI(pairs.map(R.join('=')).join('&'));
};

var serializeRole = (role, project) => {
    const owner = project.owner;
    const name = project.name;
    const src = role.SourceCode ? 
        `<snapdata>+${encodeURIComponent(role.SourceCode + role.Media)}</snapdata>` :
        '';
    return `RoomName=${encodeURIComponent(name)}&` +
        `Owner=${owner}&${serialize(R.omit(['SourceCode', 'Media'], role))}` + 
        `&SourceCode=${src}`;
};

var joinActiveProject = function(userId, room, res) {
    var serialized,
        createdNewRole = false;

    let openRole = room.getUnoccupiedRole();

    trace(`room "${room.name}" is already active`);

    const getRoleContent = openRole ? room.getRole(openRole) : Q();

    return getRoleContent.then(role => {
        if (role) {  // Send an open role and add the user
            trace(`adding ${userId} to open role "${openRole}" at "${room.name}"`);
            serialized = serializeRole(role, room);
            return res.send(`Owner=${room.owner}&NewRole=${createdNewRole}&${serialized}`);
        } else {  // If no open role w/ cache -> make a new role
            let i = 2,
                base;

            if (!openRole) {
                createdNewRole = true;
                openRole = base = 'new role';
                while (room.hasOwnProperty(openRole)) {
                    openRole = `${base} (${i++})`;
                }
                trace(`creating new role "${openRole}" at "${room.name}" ` +
                    `for ${userId}`);
            } else {
                error(`Found open role "${openRole}" but it is not cached! May have lost data!!!`);
            }

            info(`adding ${userId} to new role "${openRole}" at "${room.name}"`);

            role = getEmptyRole(openRole);
            return room.setRole(openRole, role).then(() => {
                serialized = serializeRole(role, room);
                return res.send(`Owner=${room.owner}&NewRole=${createdNewRole}&${serialized}`);
            });
        }
    });
};

// Function helpers
var FN_ARGS = /^(function)?\s*[^\(]*\(\s*([^\)]*)\)/m,
    FN_ARG_SPLIT = /,/,
    STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

var getArgumentsFor = function(fn) {
    var fnText,
        args;

    if (fn.args) {
        return fn.args;
    }

    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    args = fnText.match(FN_ARGS)[2].split(FN_ARG_SPLIT);
    return args
        .map(arg => arg.replace(/\s+/g, ''))
        .filter(arg => !!arg);
};

// given a project source code returns an array of used services as tags.
var extractRpcs = function(projectXml){
    let rpcs = [];
    let foundRpcs = projectXml.match(/getJSFromRPCStruct"><l>([a-zA-Z\-_0-9]+)<\/l>/g);
    if (foundRpcs) {
        foundRpcs.forEach(txt=>{
            rpcs.push(txt.match(/getJSFromRPCStruct"><l>([a-zA-Z\-_0-9]+)<\/l>/)[1]);
        });                
    }
    return rpcs;
};

var computeAspectRatioPadding = function(width, height, ratio){
    var diff,
        left = 0,
        top = 0,
        right = 0,
        bottom = 0,
        expectedHeight = width/ratio;

    if (expectedHeight > height) {  // Add padding to the height
        diff = expectedHeight - height;
        top = bottom = diff/2;
        trace(`new dims should be ${width}x${height+diff}`);
    } else {  // add padding to the width
        diff = ratio * height - width;
        left = right = diff/2;
        trace(`new dims should be ${width+diff}x${height}`);
    }
    return {left, right, top, bottom};
};

var isSocketUuid = function(name) {
    return name[0] === '_';
};

const fs = require('fs');
const path = require('path');
const EMPTY_ROLE = fs.readFileSync(path.join(__dirname, 'empty.xml'), 'utf8');
var getEmptyRole = function(name) {
    const media = '<media></media>';
    return {
        ProjectName: name,
        SourceCode: EMPTY_ROLE,
        SourceSize: EMPTY_ROLE.length,
        Media: media,
        MediaSize: media.length
    };
};

var parseField = function(src, field) {
    const startIndex = src.indexOf(`<${field}>`);
    const endIndex = src.indexOf(`</${field}>`);
    return src.substring(startIndex + field.length + 2, endIndex);
};

// Snap serialization functions
const SnapXml = {};
function isNil(thing) {
    return thing === undefined || thing === null;
}

SnapXml.escape = function (string, ignoreQuotes) {
    var src = isNil(string) ? '' : string.toString(),
        result = '',
        i,
        ch;
    for (i = 0; i < src.length; i += 1) {
        ch = src[i];
        switch (ch) {
        case '\'':
            result += '&apos;';
            break;
        case '\"':
            result += ignoreQuotes ? ch : '&quot;';
            break;
        case '<':
            result += '&lt;';
            break;
        case '>':
            result += '&gt;';
            break;
        case '&':
            result += '&amp;';
            break;
        case '\n': // escape CR b/c of export to URL feature
            result += '&#xD;';
            break;
        case '~': // escape tilde b/c it's overloaded in serializer.store()
            result += '&#126;';
            break;
        default:
            result += ch;
        }
    }
    return result;
};

SnapXml.format = function (string) {
    // private
    var i = -1,
        values = arguments,
        value;

    return string.replace(/[@$%]([\d]+)?/g, function (spec, index) {
        index = parseInt(index, 10);

        if (isNaN(index)) {
            i += 1;
            value = values[i + 1];
        } else {
            value = values[index + 1];
        }
        // original line of code - now frowned upon by JSLint:
        // value = values[(isNaN(index) ? (i += 1) : index) + 1];

        return spec === '@' ?
                SnapXml.escape(value)
                    : spec === '$' ?
                        SnapXml.escape(value, true)
                            : value;
    });
};

module.exports = {
    serialize,
    serializeArray,
    serializeRole,
    joinActiveProject,
    uuid,
    getRoomXML,
    extractRpcs,
    computeAspectRatioPadding,
    isSocketUuid,
    xml: {
        thumbnail: src => parseField(src, 'thumbnail'),
        notes: src => parseField(src, 'notes'),
        format: SnapXml.format
    },
    getEmptyRole,
    getArgumentsFor,
    APP 
};
