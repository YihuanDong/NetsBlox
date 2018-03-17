// This is a wrapper around the storage room. It provides the extra functionality expected
// of a room that is actively being used

'use strict';

const R = require('ramda');
const Q = require('q');
const _ = require('lodash');
const utils = require('../server-utils');
const Users = require('../storage/users');
const Constants = require('../../common/constants');
const ProjectActions = require('../storage/project-actions');

class ActiveRoom {

    constructor(logger, name, owner) {
        this.name = name;
        this.originTime = Date.now();

        this.roles = {};  // actual occupants
        this.roleActionIds = {};  // actual occupants

        this.owner = owner;

        // RPC contexts
        this.rpcs = {};

        // Saving
        // TODO: should I set this everytime?
        this._project = null;

        this.uuid = utils.uuid(owner, name);
        this._onRolesChanged = _.debounce(
            this.sendUpdateAndSave.bind(this),
            250,
            {maxWait: 1500}
        );

        this._logger = logger.fork('active-room:' + this.uuid);
        this._logger.log('created!');
    }

    getUuid() {
        return utils.uuid(this.owner, this.name);
    }

    close () {
        // Remove all sockets from this group
        var msg = {type: 'project-closed'};
        this.sockets().forEach(socket => socket.send(msg));

        // If the owner is a socket uuid, then delete it from the database, too
        if (this._project) {
            return this._project.isTransient()
                .then(isTrans => {
                    if (isTrans) {
                        this._logger.trace(`removing project ${this.uuid} as the room has closed`);
                        this._project.destroy();
                    }
                });
        } else {
            return Q();
        }
    }

    isEditableFor (user) {
        return user === this.owner || this.getCollaborators().includes(user);
    }

    // This should only be called by the RoomManager (otherwise, the room will not be recorded)
    fork (logger, socket) {
        // Create a copy of the room with the socket as the new owner
        var fork = new ActiveRoom(logger, this.name, socket.username),
            roles = this.getRoleNames(),
            data;

        // Clone the room storage data
        if (this._project) {
            data = this._project.fork(fork);
            fork.setStorage(data);
        } else {
            this._logger.error('ERROR: no store defined for room "' + this.name + '"');
        }

        roles.forEach(role => fork.silentCreateRole(role));

        // Notify the socket of the fork
        socket.send({
            type: 'project-fork',
            room: fork.name
        });
        fork.onRolesChanged();
        this.onRolesChanged();

        return fork;
    }

    add (socket, role) {
        this.silentAdd(socket, role);
        this.sendUpdateMsg();
    }

    silentAdd (socket, role) {
        this._logger.trace(`adding ${socket.uuid} to ${role}`);

        const oldRoom = socket._room;
        const oldRole = socket.role;
        if (oldRoom && oldRole) {
            this._logger.trace(`removing ${socket.uuid} from old role ${oldRole}`);
            if (oldRoom === this) {
                this.silentRemove(socket);
            } else {
                oldRoom.remove(socket);
            }
        }

        this.roles[role].push(socket);
        socket.role = role;
        socket._setRoom(this);
    }

    silentRemove (socket) {
        const role = socket.role;
        const sockets = this.roles[role] || [];
        const index = sockets.indexOf(socket);
        let result = Q();

        if (index > -1) {
            sockets.splice(index, 1);
            socket.role = null;

            // if this is the last one, remove unsaved project-actions for the given role
            if (sockets.length === 0) {
                let timestamp = new Date();
                let project = this.getProject();
                let roleId = null;
                let projectId = project.getId();
                result = project.getRoleId(role)
                    .then(id => roleId = id)
                    .then(() => project.getRoleActionIdById(roleId))
                    .then(actionId => ProjectActions.clearActionsAfter(projectId, roleId, actionId, timestamp));
            }
        } else {
            this._logger.warn(`could not remove socket ${socket.username} from ${this.uuid}. Not found`);
        }
        return result;
    }

    remove (socket) {
        this.silentRemove(socket);
        this.sendUpdateMsg();
        this.check();
    }

    getStateMsg () {
        var occupants = {},
            msg;

        this.getRoleNames()
            .forEach(role => occupants[role] =
                this.getSocketsAt(role).map(socket => {
                    return {
                        uuid: socket.uuid,
                        username: utils.isSocketUuid(socket.username) ?
                            null : socket.username
                    };
                }));

        msg = {
            type: 'room-roles',
            owner: this.owner,
            collaborators: this.getCollaborators(),
            name: this.name,
            occupants: occupants
        };
        return msg;
    }

    setStorage(store) {
        this._project = store;
        store._room = store._room || this;
    }

    addCollaborator(username) {
        return this._project.addCollaborator(username)
            .then(() => this.onRolesChanged());
    }

    getCollaborators() {
        return this._project ? this._project.collaborators.slice() : [];
    }

    removeCollaborator(username) {
        return this._project.removeCollaborator(username)
            .then(() => this.onRolesChanged());
    }

    getProjectId() {
        return this._project && this._project._id;
    }

    getProject() {
        return this._project;
    }

    getOwner() {
        // Look up the owner in the user storage
        return Users.get(this.owner);
    }

    getOwnerSockets() {
        return this.sockets()
            .filter(socket => socket.username === this.owner);
    }

    setOwner(owner) {
        this.owner = owner;
        return this.changeName();
    }

    changeName(name, force, inPlace) {
        let owner = null;
        // Check if this project is already saved for the owner.
        //   - If so, keep the same name
        //   - Else, request a new name
        name = name || this.name;
        return this.getOwner()
            .then(_owner => {
                owner = _owner;
                if (owner) {
                    return owner.getAllRawProjects();
                }
                return [];
            })
            .then(projects => {
                const existing = projects.find(project => project.name === name);
                const nameConflicts = existing && existing.originTime !== this.originTime;
                if (nameConflicts || force) {
                    // make sure name is also unique to the existing rooms...
                    let activeRoomNames = this.getAllActiveFor(this.owner)
                        .filter(room => room !== this)
                        .map(room => room.name);
                    this._logger.trace(`all active rooms for ${this.owner} are ${activeRoomNames}`);
                    return owner.getNewName(name, activeRoomNames);
                }
                return name;
            })
            .then(name => {
                const project = this.getProject();
                if (inPlace && project) {
                    this.name = name;
                    return project.setName(name)
                        .then(() => this.update(name));
                } else {
                    return this.update(name).then(() => name);
                }
            });
    }

    save() {
        if (this._project) {  // has been saved
            return this._project.save();
        }
        return Q();
    }

    sendFrom (socket, msg) {
        this.sockets()
            .filter(s => s !== socket)  // Don't send to origin
            .forEach(socket => socket.send(msg));
    }

    // Send to everyone, including the origin socket
    sendToEveryone (msg) {
        // Set the dstId to CONSTANTS.EVERYONE if not already set
        if (!msg.dstId) {
            msg.dstId = Constants.EVERYONE;
        }
        this.sockets().forEach(socket => socket.send(msg));
    }

    sockets () {
        return R.values(this.roles)
            .reduce((l1, l2) => l1.concat(l2), []);
    }

    isOccupied(role) {
        return this.roles[role] && !!this.roles[role].length;
    }

    getUnoccupiedRole() {
        return this.getRoleNames()
            .sort((n1, n2) => this.roles[n1].length < this.roles[n2].length ? -1 : 1)
            .shift();
    }

    getSocketsAt (role) {
        if (!this.roles[role]) return [];
        return this.roles[role].slice();
    }

    ownerCount () {
        return this.sockets()
            .map(socket => socket.username)
            .filter(name => name === this.owner)
            .length;
    }

    contains (username) {
        return !!this.sockets().find(socket => socket.username === username);
    }

    update (name) {
        var oldUuid = this.uuid;
        this.name = name || this.name;
        this.uuid = utils.uuid(this.owner, this.name);

        if (this.uuid !== oldUuid) {
            this._logger.trace('updating uuid to ' + this.uuid);
            this.onUuidChange(oldUuid);
        }
        if (name) {
            return this.onRolesChanged();
        }
        return Q();
    }

    /////////// Role Operations ///////////
    hasRole (name) {
        return this.roles.hasOwnProperty(name);
    }

    getRoleNames () {
        return Object.keys(this.roles);
    }

    _getRole(role, skipSave) {  // Get the project state for a given role
        let socket = this.getSocketsAt(role)[0];

        // request it from the role if occupied or get it from the database
        if (socket) {
            return socket.getProjectJson()
                .then(content => {
                    if (!skipSave) {
                        return this.setRole(role, content)
                            .then(() => content);
                    }
                    return content;
                })
                .catch(err => {
                    this._logger.trace(`could not get project json for ${role} in ${this.name}: ${err}`);
                    return this._project.getRole(role);
                });
        } else {
            return this._project.getRole(role);
        }
    }

    getRole(role, skipSave) {  // Get the role and record the current actionId
        return this._getRole(role, skipSave)
            .then(content => {
                if (content) {
                    return this.setRoleActionId(role, utils.xml.actionId(content.SourceCode))
                        .then(() => content);
                }
                return content;
            });
    }

    // These next two methods are storing the action id. Currently, it is stored
    // in memory but might be good to move to some persistent storage
    setRoleActionId(role, id) {
        this.roleActionIds[role] = Math.max(id, this.roleActionIds[role] || 0);
        return Q();
    }

    getRoleActionId(role) {
        return Q(this.roleActionIds[role] || -Infinity);
    }

    setRole(role, content) {
        this._logger.trace(`setting ${role} to ${content}`);
        this.roles[role] = this.roles[role] || null;
        return this._project.setRole(role, content);
    }

    setRoles(roles) {  // bulk load - no update necessary
        this._logger.trace(`saving all roles in ${this.uuid}`);
        return this._project.setRoles(roles);
    }

    cloneRole(roleId) {
        // Create the new role
        let count = 2;
        let newRole;
        while (this.roles.hasOwnProperty(newRole = `${roleId} (${count++})`));

        if (!this.roles[newRole]) {
            this.roles[newRole] = [];
        }

        return this.saveRole(roleId)
            .then(() => this._project.cloneRole(roleId, newRole))
            .then(() => this.onRolesChanged())
            .then(() => newRole);
    }

    createRole (role, content) {
        return this.silentCreateRole(role, content)
            .then(() => this.onRolesChanged());
    }

    silentCreateRole (role, content) {
        if (!this.roles[role]) {
            this._logger.trace(`Adding role ${role}`);
            this.roles[role] = [];
            if (content) {
                return this.setRole(role, content || utils.getEmptyRole(role));
            }
        }
        return Q();
    }

    updateRole () {
        this.onRolesChanged();
    }

    saveRole(role) {
        const socket = this.roles[role][0];

        if (!socket) {
            this._logger.warn(`cannot save unoccupied role: ${role}`);
            return Q();
        }

        return socket.getProjectJson()
            .then(content => this.setRole(role, content));
    }

    removeRole (id) {
        this._logger.trace(`removing role "${id}"`);

        delete this.roles[id];

        return this._project.removeRole(id)
            .then(() => {
                this.check();
                this.onRolesChanged();
            });
    }

    renameRole (roleId, newId) {
        if (this.roles[newId]) {
            this._logger.warn(`Cannot rename role: "${newId}" is already taken`);
            return;
        }

        let sockets = this.getSocketsAt(roleId);
        sockets.forEach(socket => socket.role = newId);
        this.roles[newId] = sockets;

        delete this.roles[roleId];

        return this._project.renameRole(roleId, newId)
            .then(() => {
                this.onRolesChanged();
                this.check();
            });
    }

    sendUpdateMsg () {
        var msg = this.getStateMsg();

        this.sockets().forEach(socket => socket.send(msg));
    }

    onRolesChanged() {
        return Q(this._onRolesChanged());
    }

    sendUpdateAndSave () {
        // This should be called when the room layout changes in a way that
        // effects the datamodel (eg, created role). Changes about clients
        // moving around should call sendUpdateMsg
        this.sendUpdateMsg();
        return this.save();
    }

    serialize() {  // Create project xml from the current room
        return Q.all(this.getRoleNames().map(name => this.getRole(name, true)))
            .then(roles => {
                const roleContents = roles.map(content =>
                    utils.xml.format('<role name="@">', content.ProjectName) +
                        content.SourceCode + content.Media + '</role>'
                );

                // only save the ones that may have been updated
                const updateRoles = this.getRoleNames()
                    .filter(name => this.isOccupied(name))
                    .map(name => roles.find(role => role.ProjectName === name))
                    .filter(role => !!role);

                return this.setRoles(updateRoles)
                    .then(() => utils.xml.format('<room name="@" app="@">', this.name, utils.APP) +
                    roleContents.join('') + '</room>');
            });
    }
}

// Factory method
ActiveRoom.fromStore = function(logger, project) {
    var room = new ActiveRoom(logger, project.name, project.owner);

    // Store the project
    room.setStorage(project);
    room.originTime = project.originTime;

    return project.getRoleNames().then(names => {
        names.filter(name => !room.roles.hasOwnProperty(name))
            .forEach(newName => room.roles[newName] = []);
        room.onRolesChanged();
        return room;
    });
};

module.exports = ActiveRoom;
