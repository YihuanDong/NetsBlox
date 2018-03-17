'use strict';

var debug = require('debug'),
    error = debug('netsblox:rpc:battleship:error'),
    trace = debug('netsblox:rpc:battleship:trace'),
    Board = require('./board'),
    TurnBased = require('../utils/turn-based'),
    BattleshipConstants = require('./constants'),
    Constants = require('../../../../common/constants'),
    BOARD_SIZE = BattleshipConstants.BOARD_SIZE,
    SHIPS = BattleshipConstants.SHIPS,
    DIRS = BattleshipConstants.DIRS;

var isHorizontal = dir => dir === 'east' || dir === 'west';

class Battleship extends TurnBased {
    constructor () {
        super('fire', 'reset');
        this._state = {};
        this._state._boards = {};
        this._state._STATE = BattleshipConstants.PLACING;
    }
}

var isValidDim = dim => 0 <= dim && dim <= BOARD_SIZE;
var checkRowCol = (row, col) => isValidDim(row) && isValidDim(col);

Battleship.prototype.reset = function() {
    this._state._STATE = BattleshipConstants.PLACING;
    this._state._boards = {};
    return true;
};

Battleship.prototype.start = function() {
    // Check that all boards are ready
    var roles = Object.keys(this._state._boards),
        sockets = this.socket._room.sockets(),
        shipsLeft,
        board;

    if (this._state._STATE !== BattleshipConstants.PLACING) {
        return 'Game has already started!';
    }

    if (!roles.length) {
        return 'Waiting on everyone! Place some ships!';
    }

    for (var i = roles.length; i--;) {
        board = this._state._boards[roles[i]];
        shipsLeft = board.shipsLeftToPlace();
        if (shipsLeft !== 0) {
            return `${roles[i]} still needs to place ${shipsLeft} ships`;
        }
    }

    // If so, send the start! message
    sockets.forEach(s => s.send({
        type: 'message',
        msgType: 'start',
        dstId: Constants.EVERYONE
    }));

    this._state._STATE = BattleshipConstants.SHOOTING;
    return true;
};

Battleship.prototype.placeShip = function(ship, row, column, facing) {
    var role = this.socket.role,
        len = SHIPS[ship];

    row--;
    column--;

    if (this._state._STATE !== BattleshipConstants.PLACING) {
        return 'Cannot move ships after game has started';
    }

    if (!DIRS[facing]) {
        return `Invalid direction "${facing}"`;
    }

    if (!len) {  // no ship found
        return `Invalid ship "${ship}"`;
    }

    // correct for 1 indexing
    var dr = isHorizontal(facing) ? 0 : DIRS[facing]*len-1,
        dc = !isHorizontal(facing) ? 0 : DIRS[facing]*len-1,
        endRow = row + dr,
        endCol = column + dc;

    if (!checkRowCol(row, column) || !checkRowCol(endRow, endCol)) {
        return `Invalid position (${row}, ${column}) to (${endRow},${endCol})`;
    }

    // Create a board if none exists
    if (!this._state._boards[role]) {
        trace(`creating board for ${role}`);
        this._state._boards[role] = new Board(BOARD_SIZE);
    }

    // Place the ship
    var result = this._state._boards[role].placeShip(ship, row, column, endRow, endCol);
    return result || 'Could not place ship - colliding with another ship!';
};

Battleship.prototype.fire = function(row, column) {
    var socket = this.socket,
        role = socket.role,
        roles,
        target = null;  // could be used to set the target role

    row = row-1;
    column = column-1;
    if (this._state._STATE === BattleshipConstants.PLACING) {
        this.response.send('Cannot fire until game has officially started');
        return false;
    }

    // If target is not provided, try to get another role with a board.
    // If none exists, just try to get another role in the room
    if (!target) {
        trace('trying to infer a target');
        roles = Object.keys(this._state._boards);
        if (!roles.length) {
            roles = socket._room.getRoleNames();
            trace(`no other boards. Checking other roles in the room (${roles})`);
        }

        target = roles.filter(r => r !== role).shift();
    }

    trace(`${role} is firing at ${target} (${row}, ${column})`);
    if (!checkRowCol(row, column)) {
        this.response.status(400).send(`Invalid position (${row}, ${column})`);
        return false;
    }

    // Fire at row, col and send messages for:
    //   - hit <target> <ship> <row> <col> <sunk>
    //   - miss <target> <row> <col>
    if (!this._state._boards[target]) {
        error(`board doesn't exist for "${target}"`);
        this._state._boards[target] = new Board(BOARD_SIZE);
    }

    var result = this._state._boards[target].fire(row, column),
        msg;

    if (result) {
        msg = {
            type: 'message',
            dstId: Constants.EVERYONE,
            msgType: result.HIT ? BattleshipConstants.HIT : BattleshipConstants.MISS,
            content: {
                role: target,
                row: row+1,
                column: column+1,
                ship: result.SHIP,
                sunk: result.SUNK
            }
        };

        socket._room.sockets().forEach(s => s.send(msg));
    }

    this.response.send(!!result);
    return !!result;
};

Battleship.prototype.remainingShips = function(roleId) {
    var role = roleId || this.socket.role;

    if (!this._state._boards[role]) {
        error(`board doesn't exist for "${role}"`);
        this._state._boards[role] = new Board(BOARD_SIZE);
    }

    return this._state._boards[role].remaining();
};

Battleship.prototype.allShips = function() {
    return Object.keys(SHIPS);
};

Battleship.prototype.shipLength = function(ship) {
    ship = (ship || '').toLowerCase();

    if (!SHIPS[ship]) {
        return `Ship "${ship}" not found!`;
    }
    trace(`request for length of ${ship} (${SHIPS[ship]})`);
    return SHIPS[ship];
};

module.exports = Battleship;
