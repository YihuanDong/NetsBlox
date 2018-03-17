/* globals driver, SnapActions, Point, SnapUndo, expect, SnapCloud */
describe('actions', function() {
    var position = new Point(600, 600);

    beforeEach(function(done) {
        driver.reset(done);
    });

    it('should have default color w/ setColorField', function(done) {
        var action = driver.addBlock('setColor', position);
        action.accept(block => {
            SnapActions.setColorField(block.inputs()[0])
                .accept(() => done());
        });
    });

    it('should not animate move block when not focused', function(done) {
        var action = driver.addBlock('forward', position);

        // Create two blocks. Connect one to another then change to the stage and undo/redo
        action.accept(block => {
            driver.addBlock('forward', new Point(800, 800))
                .accept(block2 => {
                    // connect block to block2
                    var target = {
                        element: block2,
                        point: new Point(800, 800),
                        loc: 'bottom'
                    };
                    driver.selectStage();
                    SnapActions.moveBlock(block, target)
                        .accept(() => {
                            var id = Object.keys(SnapUndo.eventHistory)[0];
                            SnapUndo.undo(id)
                                .accept(() => SnapUndo.redo(id).accept(() => done()));
                        });
                });
        });
    });

    it('should only animate if focused', function() {
        var stage = driver.ide().stage;

        SnapActions.currentEvent = {replayType: 1};
        driver.selectSprite('Sprite');
        expect(!!SnapActions.canAnimate(stage)).to.be(false);
        driver.selectStage();
        expect(!!SnapActions.canAnimate(stage)).to.be(true);
    });

    describe('collaboration', function() {
        var username;

        before(function() {
            username = SnapCloud.username;
        });

        after(function() {
            SnapCloud.username = username;
        });

        it('should detect collaboration if multiple users in role', function() {
            var ide = driver.ide();

            ide.room.roles[ide.projectName].push({username: 'test', uuid: 'ad'});
            expect(SnapActions.isCollaborating()).to.be(true);
        });

        it('should detect not collaborating if only user in role', function() {
            expect(SnapActions.isCollaborating()).to.be(false);
        });

        it('should detect leader by default', function() {
            expect(driver.ide().room.isLeader()).to.be(true);
        });

        it('should detect leader based off of uuid', function() {
            var ide = driver.ide();

            SnapCloud.username = 'test';
            setTimeout(() => {
                ide.room.roles[ide.projectName].unshift({username: SnapCloud.username, uuid: 'ad'});
                expect(ide.room.isLeader()).to.be(false);
            }, 50);
        });
    });

    describe('bug reporting', function() {
        it('should report bugs if completeAction is called with error', function(done) {
            var ide = driver.ide();
            ide.submitBugReport = () => {
                delete ide.submitBugReport;
                done();
            };
            SnapActions.completeAction('testError');
        });
    });

    describe('openProject', function() {
        beforeEach(function(done) {
            driver.reset(done);
        });

        afterEach(function() {
            driver.ide().exitReplayMode();
        });

        it('should allow opening projects from replay mode', function(done) {
            // Enter replay mode
            SnapActions.setStageSize(500, 500)
                .accept(function() {
                    driver.ide().replayEvents();

                    // try to open a new project...
                    SnapActions.openProject();

                    var dialog = driver.dialog();
                    if (dialog) return done('openProject action blocked during replay!');
                    done();
                });
        });

        it('should allow opening projects if room not editable', function(done) {
            var room = driver.ide().room;
            var isEditable = room.isEditable;

            driver.addBlock('forward').accept(() => {
                room.isEditable = () => false;
                var action = SnapActions.openProject();

                setTimeout(function() {
                    room.isEditable = isEditable;
                    // make sure there is no block
                    let sprite = driver.ide().currentSprite;
                    let blocks = sprite.scripts.children;
                    if (blocks.length) return done('Could not openProject');
                    done();
                }, 150);
            });
        });

        it('should get unique id with newId', function() {
            let id = SnapActions.newId();
            let owner = SnapActions.getOwnerFromId(id);
            expect(owner).to.be(undefined);
        });
    });

    describe('action queue', function() {
        let oldSendJSON = null;
        let oldApplyEvent = null;
        let sockets = null;

        before(function() {
            sockets = driver.ide().sockets;
            oldSendJSON = sockets.sendJSON;
            oldApplyEvent = sockets._applyEvent;
        });

        afterEach(function() {
            sockets.sendJSON = oldSendJSON;
            sockets._applyEvent = oldApplyEvent;
            SnapActions.queuedActions = [];
        });

        it('should not request-actions if already requested', function() {
            sockets.sendJSON = () => {
                // first request
                sockets.sendJSON = () => {
                    throw Error('Requested actions twice!');
                };
                SnapActions.requestMissingActions();
            };

            SnapActions.requestMissingActions();
        });

        it('should queue actions in order', function() {
            SnapActions.addActionToQueue({id: 1});
            SnapActions.addActionToQueue({id: 0});
            SnapActions.addActionToQueue({id: 3});
            SnapActions.addActionToQueue({id: 2});
            SnapActions.queuedActions.forEach((action, index) => {
                expect(action.id).to.be(index);
            });
        });

        it('should ignore old actions', function() {
            sockets._applyEvent = () => {
                throw Error('applying old action!');
            };
            SnapActions.onReceiveAction({id: -1});
        });
    });

    describe('accept/reject', function() {
        beforeEach(done => driver.reset(done));

        it('should clear reject handler on accepted action', function(done) {
            SnapActions.setStageSize(500, 500)
                .reject(() => done('Called reject handler'));

            setTimeout(() => SnapActions.setStageSize(400, 400), 0);
            setTimeout(done, 100);
        });
    });
});
