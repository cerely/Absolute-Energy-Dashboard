/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
    This file tests the readings retrieval API line chart flow meters.
    See: https://github.com/OpenEnergyDashboard/DesignDocs/blob/main/testing/testing.md for information.
*/

const { chai, mocha, app } = require('../common');
const Unit = require('../../models/Unit');
const { prepareTest,
    parseExpectedCsv,
    expectRangeToEqualExpected,
    getUnitId,
    ETERNITY,
    METER_ID} = require('../../util/readingsUtils');

mocha.describe('readings API', () => {
    mocha.describe('readings test, test if data returned by API is as expected', () => {
        mocha.describe('for line charts', () => {
            mocha.describe('for flow meters', () => {

                // Add LR8 here

                mocha.it('LR25: should have daily points for 15 minute reading intervals and flow units with +-inf start/end time & thing as thing where rate is 36', async () => {
                    const unitData = [
                        {   
                            // u14
                            name: 'Thing_36',
                            identifier: '',
                            unitRepresent: Unit.unitRepresentType.FLOW,
                            secInRate: 36,
                            typeOfUnit: Unit.unitType.METER,
                            suffix: '',
                            displayable: Unit.displayableType.NONE,
                            preferredDisplay: false,
                            note: 'special unit'
                        },
                        {
                            // u15
                            name: 'thing unit',
                            identifier: '',
                            unitRepresent: Unit.unitRepresentType.FLOW,
                            secInRate: 3600,
                            typeOfUnit: Unit.unitType.UNIT,
                            suffix: '',
                            displayable: Unit.displayableType.ALL,
                            preferredDisplay: false,
                            note: 'special unit'
                        }
                    ];

                    const conversionData = [
                        {
                            // c15
                            sourceName: 'Thing_36',
                            destinationName: 'thing unit',
                            bidirectional: false,
                            slope: 1,
                            intercept: 0,
                            note: 'Thing_36 → thing unit'
                        }
                    ];

                    const meterData = [
                        {
                            name: 'Thing_36 thing unit',
                            unit: 'Thing_36',
                            defaultGraphicUnit: 'thing unit',
                            displayable: true,
                            gps: undefined,
                            note: 'special meter',
                            file: 'test/web/readingsData/readings_ri_15_days_75.csv',
                            deleteFile: false,
                            readingFrequency: '15 minutes',
                            id: METER_ID
                        }
                    ];
                    await prepareTest(unitData, conversionData, meterData);

                    const unitId = await getUnitId('thing unit');

                    const expected = await parseExpectedCsv('src/server/test/web/readingsData/expected_line_range_ri_15_mu_Thing36_gu_thing_st_-inf_et_inf.csv');

                    const res = await chai.request(app).get(`/api/unitReadings/line/meters/${METER_ID}`)
                        .query({ timeInterval: ETERNITY.toString(), graphicUnitId: unitId });
                    expectRangeToEqualExpected(res, expected)
                });

                // Add LR26 here
            });
        });
    });
});
