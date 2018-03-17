describe('simple hangman', function() {
    const utils = require('../../../../assets/utils');
    var SimpleHangman = utils.reqSrc('rpc/procedures/simple-hangman/simple-hangman'),
        RPCMock = require('../../../../assets/mock-rpc'),
        hangman = new RPCMock(SimpleHangman),
        assert = require('assert');

    beforeEach(function() {
        hangman = new RPCMock(SimpleHangman);
        hangman._rpc._state.word = 'battleship';
    });

    utils.verifyRPCInterfaces(hangman, [
        ['restart'],
        ['getCurrentlyKnownWord'],
        ['guess', ['letter']],
        ['isWordGuessed'],
        ['getWrongCount']
    ]);

    describe('restart', function() {
        it('should return true', function() {
            assert(hangman.restart());
        });

        it('should reset word', function() {
            hangman.restart();
            assert.notEqual(hangman._rpc._state.word, 'battleship');
        });

        it('should reset wrong guesses', function() {
            hangman._rpc._state.wrongGuesses = 100;
            hangman.restart();
            assert.equal(hangman._rpc._state.wrongGuesses, 0);
        });

        it('should reset known indices', function() {
            hangman._rpc._state.knownIndices = [1,2,3];
            hangman.restart();
            assert.equal(hangman._rpc._state.knownIndices.length, 0);
        });
    });

    describe('getCurrentlyKnownWord', function() {

        it('should replace unknown letters w/ _', function() {
            var displayedWord;
            hangman._rpc._state.knownIndices = [1, 3, 5, 7];
            displayedWord = hangman.getCurrentlyKnownWord();
            assert.equal(displayedWord, '_a_t_e_h__'.split('').join(' '));
        });
    });

    describe('guess', function() {

        describe('incorrect', function() {
            it('should increment wrong guesses', function() {
                var oldBadGuesses = hangman._rpc._state.wrongGuesses;
                hangman.guess('z');
                assert.equal(hangman._rpc._state.wrongGuesses, oldBadGuesses+1);
            });

        });

        describe('correct', function() {
            it('should not increment wrong guesses', function() {
                var oldBadGuesses = hangman._rpc._state.wrongGuesses;
                hangman.guess('a');
                assert.equal(hangman._rpc._state.wrongGuesses, oldBadGuesses);
            });

            it('should update the display word', function() {
                var displayedWord = hangman.getCurrentlyKnownWord(),
                    missing = displayedWord.match(/_/g).length;

                hangman.guess('t');
                assert.notEqual(missing, hangman.getCurrentlyKnownWord().match(/_/g).length);
            });
        });

    });

    describe('isWordGuessed', function() {
        it('should return true if entire word has been guessed', function() {
            var letters = hangman._rpc._state.word.split('');

            letters.forEach(letter => hangman.guess(letter));
            assert(hangman.isWordGuessed());
        });
    });

    describe('getWrongCount', function() {
        it('should return the wrongGuesses value', function() {
            hangman._rpc._state.wrongGuesses = 100;
            assert.equal(hangman.getWrongCount(), 100);
        });
    });
});
