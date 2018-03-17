describe('staticmap', function() {
    const utils = require('../../../../assets/utils');
    var StaticMap = utils.reqSrc('rpc/procedures/google-maps/google-maps'),
        RPCMock = require('../../../../assets/mock-rpc'),
        assert = require('assert'),
        staticmap = new RPCMock(StaticMap);

    before(function(done) {
        utils.connect()
            .then(() => {
                staticmap = new RPCMock(StaticMap);
                done();
            });
    });

    describe('interfaces', function() {
        utils.verifyRPCInterfaces(staticmap, [
            ['getMap', ['latitude', 'longitude', 'width', 'height', 'zoom']],
            ['getSatelliteMap', ['latitude', 'longitude', 'width', 'height', 'zoom']],
            ['getTerrainMap', ['latitude', 'longitude', 'width', 'height', 'zoom']],
            ['getLongitude', ['x']],
            ['getLatitude', ['y']],
            ['getXFromLongitude', ['longitude']],
            ['getYFromLatitude', ['latitude']],
            ['getImageCoordinates', ['latitude', 'longitude']],
            ['getEarthCoordinates', ['x', 'y']],
            ['maxLongitude'],
            ['maxLatitude'],
            ['minLongitude'],
            ['getDistance', ['startLatitude', 'startLongitude', 'endLatitude', 'endLongitude']],
            ['minLatitude']
        ]);
    });

    describe('getDistance', function() {
        it('should calculate distance in meters (string input)', function(){
            let distance = staticmap.getDistance('36', '-86', '36', '-87');
            assert.deepEqual(distance, 90163);
        });
        it('should calculate distance in meters (integer input)', function(){
            let distance = staticmap.getDistance(36, -86, 36, -87);
            assert.deepEqual(distance, 90163);
        });
    });

    describe('x,y to lat, lon', function() {
        // create a map near boundaries
        const map = {
            center: {
                lat: 36.152,
                lon: -150,
            },
            width: 480,
            height: 360,
            zoom: 2,
            scale: 1,
            mapType: 'roadmap'
        };

        it('should handle wraparound at map boundaries', function(){
            let coords = staticmap._rpc._coordsAt(-170, 90, map);
            assert(coords.lon > -180 && coords.lon < 180);
            map.center.lon = +150;
            coords = staticmap._rpc._coordsAt(170, 90, map);
            assert(coords.lon > -180 && coords.lon < 180);
        });

    });

});
