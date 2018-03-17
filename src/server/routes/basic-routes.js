'use strict';
var R = require('ramda'),
    _ = require('lodash'),
    Q = require('q'),
    Utils = _.extend(require('../utils'), require('../server-utils.js')),
    exists = require('exists-file'),
    PublicProjects = require('../storage/public-projects'),
    UserAPI = require('./users'),
    RoomAPI = require('./rooms'),
    ProjectAPI = require('./projects'),
    EXTERNAL_API = UserAPI
        .concat(ProjectAPI)
        .concat(RoomAPI)
        .filter(api => api.Service)
        .map(R.omit.bind(R, 'Handler'))
        .map(R.omit.bind(R, 'middleware')),

    debug = require('debug'),
    log = debug('netsblox:api:log'),
    fs = require('fs'),
    path = require('path'),
    EXAMPLES = require('../examples'),
    mailer = require('../mailer'),
    middleware = require('./middleware'),
    SocketManager = require('../socket-manager'),
    saveLogin = middleware.saveLogin,

    // PATHS
    PATHS = [
        'Costumes',
        'Sounds',
        'help',
        'Backgrounds'
    ],
    CLIENT_ROOT = path.join(__dirname, '..', '..', 'client'),
    SNAP_ROOT = path.join(CLIENT_ROOT, 'Snap--Build-Your-Own-Blocks'),
    publicFiles = [
        'snap_logo_sm.png',
        'tools.xml'
    ];

// merge netsblox libraries with Snap libraries
var snapLibRoot = path.join(SNAP_ROOT, 'libraries');
var snapLibs = fs.readdirSync(snapLibRoot).map(filename => 'libraries/' + filename);
var libs = fs.readdirSync(path.join(CLIENT_ROOT, 'libraries'))
    .map(filename => 'libraries/' + filename)
    .concat(snapLibs);

// Create the paths
var resourcePaths = PATHS.map(function(name) {
    var resPath = path.join(SNAP_ROOT, name);

    return { 
        Method: 'get', 
        URL: name + '/:filename',
        Handler: function(req, res) {
            res.sendFile(path.join(resPath, req.params.filename));
        }
    };
});

// Add translation file paths
var getFileFrom = dir => {
    return file => {
        return {
            Method: 'get', 
            URL: file,
            Handler: (req, res) => res.sendFile(path.join(dir, file))
        };
    };
};

const isInNetsBlox = file => exists.sync(path.join(CLIENT_ROOT, file));
var overrideSnapFiles = function(snapFiles) {
    var netsbloxFiles = Utils.extract(isInNetsBlox, snapFiles);

    resourcePaths = resourcePaths
        .concat(snapFiles.map(getFileFrom(SNAP_ROOT)))
        .concat(netsbloxFiles.map(getFileFrom(CLIENT_ROOT)));
};

var snapLangFiles = fs.readdirSync(SNAP_ROOT)
    .filter(name => /^lang/.test(name));

overrideSnapFiles(snapLangFiles);
overrideSnapFiles(libs);

publicFiles = publicFiles.concat(snapLangFiles);

// Add importing tools, logo to the resource paths
resourcePaths = resourcePaths.concat(publicFiles.map(file => {
    return {
        Method: 'get', 
        URL: file,
        Handler: function(req, res) {
            if (file.includes('logo')) {
                res.sendFile(path.join(CLIENT_ROOT, 'netsblox_logo_sm.png'));
            } else {
                res.sendFile(path.join(SNAP_ROOT, file));
            }
        }
    };
}));

// Add importing rpcs to the resource paths
var rpcManager = require('../rpc/rpc-manager'),
    RPC_ROOT = path.join(__dirname, '..', 'rpc', 'libs'),
    RPC_INDEX = fs.readFileSync(path.join(RPC_ROOT, 'RPC'), 'utf8')
        .split('\n')
        .filter(line => {
            var parts = line.split('\t'),
                deps = parts[2] ? parts[2].split(' ') : [],
                displayName = parts[1];

            // Check if we have loaded the dependent rpcs
            for (var i = deps.length; i--;) {
                if (!rpcManager.isRPCLoaded(deps[i])) {
                    // eslint-disable-next-line no-console
                    console.log(`Service ${displayName} not available because ${deps[i]} is not loaded`);
                    return false;
                }
            }
            return true;
        })
        .map(line => line.split('\t').splice(0, 2).join('\t'))
        .join('\n');

var rpcRoute = { 
    Method: 'get', 
    URL: 'rpc/:filename',
    Handler: function(req, res) {
        var RPC_ROOT = path.join(__dirname, '..', 'rpc', 'libs');

        // IF requesting the RPC file, filter out unsupported rpcs
        if (req.params.filename === 'RPC') {
            res.send(RPC_INDEX);
        } else {
            res.sendFile(path.join(RPC_ROOT, req.params.filename));
        }
    }
};
resourcePaths.push(rpcRoute);

module.exports = [
    { 
        Method: 'get', 
        URL: 'ResetPW',
        Handler: function(req, res) {
            log('password reset request:', req.query.Username);
            var self = this,
                username = req.query.Username;

            // Look up the email
            self.storage.users.get(username)
                .then(user => {
                    if (user) {
                        delete user.hash;  // force tmp password creation
                        user.save();
                        return res.sendStatus(200);
                    } else {
                        log('Could not find user to reset password (user "'+username+'")');
                        return res.status(400).send('ERROR: could not find user "'+username+'"');
                    }
                })
                .catch(e => {
                    log('Server error when looking for user: "'+username+'". Error:', e);
                    return res.status(500).send('ERROR: ' + e);
                });
        }
    },
    { 
        Method: 'post',  // post would make more sense...
        URL: 'SignUp',
        Handler: function(req, res) {
            log('Sign up request:', req.body.Username, req.body.Email);
            var self = this,
                uname = req.body.Username,
                password = req.body.Password,
                email = req.body.Email;

            // Must have an email and username
            if (!email || !uname) {
                log('Invalid request to /SignUp');
                return res.status(400).send('ERROR: need both username and email!');
            }

            // validate username
            if (uname[0] === '_') {
                return res.status(400).send('ERROR: invalid username');
            }

            self.storage.users.get(uname)
                .then(user => {
                    if (!user) {
                        var newUser = self.storage.users.new(uname, email);
                        newUser.hash = password || null;
                        newUser.save();
                        return res.send('User Created!');
                    }
                    log('User "'+uname+'" already exists. Could not make new user.');
                    return res.status(401).send('ERROR: user exists');
                });
        }
    },
    { 
        Method: 'post',
        URL: 'SignUp/validate',
        Handler: function(req, res) {
            log('Signup/validate request:', req.body.Username, req.body.Email);
            var uname = req.body.Username,
                email = req.body.Email;

            // Must have an email and username
            if (!email || !uname) {
                log('Invalid request to /SignUp/validate');
                return res.status(400).send('ERROR: need both username and email!');
            }

            this.storage.users.get(uname)
                .then(user => {
                    if (!user) {
                        return res.send('Valid User Signup Request!');
                    }
                    log('User "'+uname+'" already exists.');
                    return res.status(401).send('ERROR: user exists');
                });
        }
    },
    { 
        Method: 'post', 
        URL: '',  // login method
        Handler: function(req, res) {
            var hash = req.body.__h,
                isUsingCookie = !req.body.__u,
                socket;

            // Should check if the user has a valid cookie. If so, log them in with it!
            middleware.tryLogIn(req, res, (err, loggedIn) => {
                let username = req.body.__u || req.session.username;
                if (err) {
                    return res.status(500).send(err);
                }

                if (!username) {
                    log('"passive" login failed - no session found!');
                    if (req.body.silent) {
                        return res.sendStatus(204);
                    } else {
                        return res.sendStatus(403);
                    }
                }

                // Explicit login
                log(`Logging in as ${username}`);
                return this.storage.users.get(username)
                    .then(user => {
                        if (user && (loggedIn || user.hash === hash)) {  // Sign in 
                            if (!isUsingCookie) {
                                saveLogin(res, user, req.body.remember);
                            }

                            log(`"${user.username}" has logged in.`);

                            // Associate the websocket with the username
                            socket = SocketManager.getSocket(req.body.socketId);
                            if (socket) {  // websocket has already connected
                                socket.onLogin(user);
                            }

                            user.recordLogin();
                            if (req.body.return_user) {
                                return res.status(200).json({
                                    username: username,
                                    admin: user.admin,
                                    email: user.email,
                                    api: req.body.api ? Utils.serializeArray(EXTERNAL_API) : null
                                });
                            } else {
                                return res.status(200).send(Utils.serializeArray(EXTERNAL_API));
                            }
                        } else {
                            if (user) {
                                log(`Incorrect password attempt for ${user.username}`);
                                return res.status(403).send('Incorrect password');
                            }
                            log(`Could not find user "${username}"`);
                            return res.status(403).send(`Could not find user "${username}"`);
                        }
                    })
                    .catch(e => {
                        log(`Could not find user "${username}": ${e}`);
                        return res.status(500).send('ERROR: ' + e);
                    });
            });
        }
    },
    {
        Method: 'get',
        URL: 'Examples/EXAMPLES',
        Handler: function(req, res) {
            // if no name requested, get index
            let metadata = req.query.metadata === 'true',
                examples;

            if (metadata) {
                examples = Object.keys(EXAMPLES)
                    .map(name => {
                        let example = EXAMPLES[name],
                            role = Object.keys(example.roles).shift(),
                            primaryRole,
                            services = example.services,
                            thumbnail,
                            notes;

                        // There should be a faster way to do this if all I want is the thumbnail and the notes...
                        return example.getRole(role)
                            .then(content => {
                                primaryRole = content.SourceCode;
                                thumbnail = Utils.xml.thumbnail(primaryRole);
                                notes = Utils.xml.notes(primaryRole);

                                return example.getRoleNames();
                            })
                            .then(roleNames => {
                                return {
                                    projectName: name,
                                    primaryRoleName: role,
                                    roleNames: roleNames,
                                    thumbnail: thumbnail,
                                    notes: notes,
                                    services: services
                                };
                            });
                    });

                return Q.all(examples).then(examples => res.json(examples));
            } else {
                examples = Object.keys(EXAMPLES)
                    .map(name => `${name}\t${name}\t  `)
                    .join('\n');

                return res.send(examples);
            }
        }
    },
    // individual example
    {
        Method: 'get',
        URL: 'Examples/:name',
        Handler: function(req, res) {
            var name = req.params.name,
                isPreview = req.query.preview,
                example;

            if (!EXAMPLES.hasOwnProperty(name)) {
                this._logger.warn(`ERROR: Could not find example "${name}`);
                return res.status(500).send('ERROR: Could not find example.');
            }

            // This needs to...
            //  + create the room for the socket
            example = _.cloneDeep(EXAMPLES[name]);
            var role,
                room;

            if (!isPreview) {
                return res.send(example.toString());
            } else {
                room = example;
                //  + customize and return the room for the socket
                room = _.extend(room, example);
                role = Object.keys(room.roles).shift();
            }

            return room.getRole(role)
                .then(content => res.send(content.SourceCode));
        }
    },
    // public projects
    {
        Method: 'get',
        URL: 'Projects/PROJECTS',
        Handler: function(req, res) {
            var start = +req.query.start || 0,
                end = Math.min(+req.query.end, start+1);

            return PublicProjects.list(start, end)
                .then(projects => res.send(projects));
        }
    },
    // Bug reporting
    {
        Method: 'post',
        URL: 'BugReport',
        Handler: function(req, res) {
            var user = req.body.user,
                report = req.body;

            if (user) {
                this._logger.info(`Received bug report from ${user}`);
            } else {
                this._logger.info('Received anonymous bug report');
            }

            // email this to the maintainer
            if (process.env.MAINTAINER_EMAIL) {
                var subject,
                    mailOpts;

                subject = 'Bug Report' + (user ? ' from ' + user : '');
                if (report.isAutoReport) {
                    subject = 'Auto ' + subject;
                }

                mailOpts = {
                    from: 'bug-reporter@netsblox.org',
                    to: process.env.MAINTAINER_EMAIL,
                    subject: subject,
                    markdown: 'Hello,\n\nA new bug report has been created' +
                        (user !== null ? ' by ' + user : '') + ':\n\n---\n\n' +
                        report.description + '\n\n---\n\n',
                    attachments: [
                        {
                            filename: `bug-report-v${report.version}.json`,
                            content: JSON.stringify(report)
                        }
                    ]
                };

                if (report.user) {
                    this.storage.users.get(report.user)
                        .then(user => {
                            if (user) {
                                mailOpts.markdown += '\n\nReporter\'s email: ' + user.email;
                            }
                            mailer.sendMail(mailOpts);
                            this._logger.info('Bug report has been sent to ' + process.env.MAINTAINER_EMAIL);
                        });
                } else {
                    mailer.sendMail(mailOpts);
                    this._logger.info('Bug report has been sent to ' + process.env.MAINTAINER_EMAIL);
                }
            } else {
                this._logger.warn('No maintainer email set! Bug reports will ' +
                    'not be recorded until MAINTAINER_EMAIL is set in the env!');
            }
            return res.sendStatus(200);
        }
    }
].concat(resourcePaths);
