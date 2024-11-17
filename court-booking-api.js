// court-booking-api.js
//
// SPDX-License-Identifier: MIT
//
// Copyright (C) 2024  Anthony Green <green@moxielogic.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//

require('dotenv').config();

const retry = require('async-retry');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const express = require('express');
const Joi = require('joi');

const reservationSchema = Joi.object({
    day: Joi.string().required().valid(...getNextFourDays()),
    courtNumber: Joi.number().integer().required(),
    startTime: Joi.string().required().regex(/^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i),
    partnerName: Joi.string().required(),
    partnerMembershipNumber: Joi.string().required(),
});

const app = express();
app.use(express.json());

const WEBSITE_USERNAME = process.env.WEBSITE_USERNAME;
const WEBSITE_PASSWORD = process.env.WEBSITE_PASSWORD;
const WEBSITE_LOGIN_PAGE = process.env.WEBSITE_LOGIN_PAGE;
const WEBSITE_BOOKING_PAGE = process.env.WEBSITE_BOOKING_PAGE;

if (!WEBSITE_USERNAME || !WEBSITE_PASSWORD || !WEBSITE_LOGIN_PAGE || !WEBSITE_BOOKING_PAGE) {
    console.error('Missing required environment variables: WEBSITE_USERNAME, WEBSITE_PASSWORD, WEBSITE_LOGIN_PAGE, WEBSITE_BOOKING_PAGE');
    process.exit(1);
}

// Helper function to create a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function validateTimeFormat(timeStr) {
    // Match times like '10:30 AM' or '2:00 PM'
    const timeRegex = /^(1[0-2]|0?[1-9]):[0-5][0-9]\s?(AM|PM)$/i;
    return timeRegex.test(timeStr);
}

async function login(page) {
    const cookieFileName = `cookies-${WEBSITE_USERNAME}.json`;
    const cookieFilePath = path.join(__dirname, cookieFileName);

    // Check if the cookie file exists
    if (fs.existsSync(cookieFilePath)) {
        try {
            // Load cookies from the file
            const cookiesString = fs.readFileSync(cookieFilePath, 'utf8');
            const cookies = JSON.parse(cookiesString);

            // Set cookies in the page
            await page.setCookie(...cookies);
            console.log(`Loaded cookies from ${cookieFileName}`);
            return;
        } catch (error) {
            console.log('No cookies found. Logging in.');
        }
    } else {
        await retry(async () => {
            await page.goto(WEBSITE_LOGIN_PAGE, { waitUntil: 'networkidle2' });

            await page.type('#_com_liferay_login_web_portlet_LoginPortlet_login', WEBSITE_USERNAME);
            await page.type('#_com_liferay_login_web_portlet_LoginPortlet_password', WEBSITE_PASSWORD);

            await page.click('.btn-sign-in');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        }, {
            retries: 3,
            onRetry: (err) => {
                console.warn('Login attempt failed, retrying...', err);
            },
        });

        console.log('Logged in successfully.');
        // After login, save cookies
        const cookies = await page.cookies();
        fs.writeFileSync(cookieFilePath, JSON.stringify(cookies));
    }
}

async function getOpenCourts(page, dayOfWeek) {
    openCourts = null;
    await retry(async () => {
        await page.goto(WEBSITE_BOOKING_PAGE, { waitUntil: 'networkidle2' });
        await page.waitForSelector('.horizontal-date-picker-container');

        // Click on the specified day
        const dateFound = await findAndClickDate(page, dayOfWeek);
        if (!dateFound) {
            console.log(`Date "${dayOfWeek}" not found.`);
            return [];
        }

        await delay(3000);
        console.log(`Navigated to ${dayOfWeek}`);

        await page.waitForSelector('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_data');

        openCourts = await extractOpenCourts(page);
    }, {
        retries: 3,
        onRetry: (err) => {
            console.warn('Problem getting open courts, retrying...', err);
        },
    });

    return openCourts;
}

async function findAndClickDate(page, dayOfWeek) {
    // Construct XPath to find the link containing the specified day
    const xpath = `//a[.//span[contains(@class, 'calendar-day') and contains(text(), '${dayOfWeek}')]]`;

    // Wait for the element to appear
    await page.waitForSelector('xpath/.' + xpath);

    // Find the element
    const [dayLink] = await page.$$('xpath/.' + xpath);

    if (dayLink) {
        // Trigger the onclick function directly
        await page.evaluate((element) => {
            element.onclick();
        }, dayLink);
        console.log(`Clicked on ${dayOfWeek}`);
        return true;
    } else {
        console.log(`Could not find a link for ${dayOfWeek}`);
        return false;
    }
}

async function extractOpenCourts(page) {
    // Wait for the table to load
    await page.waitForSelector('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_data');

    // Get the table rows
    const rows = await page.$$('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_data > tr');

    const courtsData = [];

    for (const row of rows) {
        const cells = await row.$$('td');
        // Assuming the first cell is the time slot column
        for (let i = 1; i < cells.length; i++) {
            const cell = cells[i];
            const isOpen = await cell.evaluate((cell) => cell.classList.contains('open'));
            if (isOpen) {
                // Use cellIndex to get the court number
                const court = await cell.evaluate((cell) => cell.cellIndex);
                const time = await cell.$eval('div', (div) => div.getAttribute('data-start-time') || '');
                courtsData.push({ court: court, time });
            }
        }
    }

    return courtsData;
}

function validateDay(dayOfWeek) {
    const validDays = getNextFourDays();
    return validDays.includes(dayOfWeek);
}

function getNextFourDays() {
    const days = [];
    const today = new Date();
    for (let i = 0; i < 4; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
        days.push(dayName);
    }
    return days;
}

app.get('/api/v1/open-courts', async (req, res) => {
    const dayOfWeek = req.query.day;

    if (!dayOfWeek) {
        return res.status(400).send({ error: 'Day parameter is required' });
    }

    if (!validateDay(dayOfWeek)) {
        return res.status(400).send({ error: 'Day must be within the next 4 days' });
    }
    const browser = await puppeteer.launch({ headless: true,
                                             args: [
                                                 '--no-sandbox',
                                                 '--disable-setuid-sandbox'
                                             ]});
    const page = await browser.newPage();

    try {
        await login(page);
        const openCourts = await getOpenCourts(page, dayOfWeek);
        res.send({ day: dayOfWeek, openCourts });
    } catch (error) {
        console.error('An error occurred:', error);
        res.status(500).send({ error: 'An error occurred while fetching open courts' });
    } finally {
        await browser.close();
    }
});

async function findAndClickSlot(page, courtNumber, startTime) {
    // Get the table rows
    const rows = await page.$$('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_data > tr');

    // Find the row with the desired start time
    let slotRow;
    for (const row of rows) {
        const timeCell = await row.$('td:first-child');
        const cellTime = await timeCell.evaluate((cell) => cell.textContent.trim());
        if (cellTime === startTime) {
            slotRow = row;
            break;
        }
    }

    if (!slotRow) {
        console.log(`Start time "${startTime}" not found.`);
        return false;
    }

    // Find the cell corresponding to the court number
    const headerCells = await page.$$('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_head > tr > th');
    let courtIndex = null;
    for (let i = 1; i < headerCells.length; i++) {
        const headerCell = headerCells[i];
        const courtText = await headerCell.evaluate((cell) => cell.textContent.trim());
        if (courtText.includes(`Court ${courtNumber}`)) {
            courtIndex = i;
            break;
        }
    }

    if (courtIndex === null) {
        console.log(`Court number "${courtNumber}" not found.`);
        return false;
    }

    // Get the desired cell in the row
    const cells = await slotRow.$$('td');
    const targetCell = cells[courtIndex];

    // Check if the slot is open
    const isOpen = await targetCell.evaluate((cell) => cell.classList.contains('open'));
    if (!isOpen) {
        console.log(`Slot at ${startTime} on court ${courtNumber} is not open.`);
        return false;
    }

    // Click on the cell to start booking
    await targetCell.click();

    return true;
}

async function addPartnerToBooking(page, partnerName, partnerMembershipNumber) {
    console.log ("Add partner to booking");

    // Wait for the element to appear in the DOM
    await page.waitForSelector("xpath/.//a[.//i[contains(@class, 'fa-plus')]]", { timeout: 5000 });
    console.log("Found plus to add user");

    const [linkWithPlusIcon] = await page.$$("xpath/.//a[.//i[contains(@class, 'fa-plus')]]");

    if (linkWithPlusIcon) {
	      // Scroll the element into view if necessary
	      await linkWithPlusIcon.evaluate((element) => element.scrollIntoView());

	      console.log("About to click on + sign to add user");
	      await delay(3000);
	      // Click the <a> element
	      await linkWithPlusIcon.click();
	      console.log('Clicked on the link containing the plus icon');
    } else {
	      console.log('Link with plus icon not found');
    }

    // Wait for the player input to appear
    const playerInputSelector = '#_activities_WAR_northstarportlet_\\:activityForm\\:playersTable\\:1\\:player_input';
    await page.waitForSelector(playerInputSelector);

    // Type the partner's name to trigger autocomplete
    await page.type(playerInputSelector, partnerName);

    console.log("Typed name")

    // Wait for the autocomplete list to appear
    await page.waitForSelector('ul.ui-autocomplete-items > li.ui-autocomplete-item', { timeout: 5000 });

    console.log("Autocompleter appears")

    // Select the partner from the list
    await page.evaluate((membershipNumber) => {
        const items = Array.from(document.querySelectorAll('ul.ui-autocomplete-items li'));
        const targetItem = items.find((item) => {
            const dataValue = JSON.parse(item.getAttribute('data-item-value'));
            return dataValue.memberNumber === membershipNumber;
        });

        if (targetItem) {
            targetItem.click();
        } else {
            throw new Error('Partner not found in autocomplete list.');
        }
    }, partnerMembershipNumber);

    console.log(`Selected partner: ${partnerName} (${partnerMembershipNumber})`);
}

async function confirmBooking(page) {
    // Wait for the 'Save' button
    await page.waitForSelector("xpath/.//button[.//span[normalize-space(text())='Save']]", { timeout: 5000 });
    const [saveButton] = await page.$$("xpath/.//button[.//span[normalize-space(text())='Save']]");

    if (saveButton) {
	      await saveButton.click();
	      console.log('Booking saved.');
    } else {
	      throw new Error('Save button not found.');
    }

    // Wait for the page to update or navigate after clicking 'Save'
    await delay(5000);

    // Check for any <h1> containing 'Restriction'
    const restrictionExists = await page.evaluate(() => {
	      const h1Elements = document.querySelectorAll('h1');
	      for (const h1 of h1Elements) {
	          console.log(h1);
	          const textContent = h1.textContent || h1.innerText;
	          console.log(textContent);
	          if (textContent.includes('Restriction')) {
		            return true;
	          }
	      }
	      return false;
    });

    if (restrictionExists) {
	      throw new Error('Booking restricted');
    }

    console.log('Booking confirmed successfully.');
}

async function reserveCourt(page, dayOfWeek, courtNumber, startTime, partnerName, partnerMembershipNumber) {
    // Navigate to the bookings page
    await page.goto(WEBSITE_BOOKING_PAGE, { waitUntil: 'networkidle2' });

    // Select the desired date
    const dateFound = await findAndClickDate(page, dayOfWeek);
    if (!dateFound) {
        throw new Error(`Date "${dayOfWeek}" not found.`);
    }

    await delay(3000);
    // Wait for the table to load
    await page.waitForSelector('#_activities_WAR_northstarportlet_\\:activityForm\\:slots_data');

    // Find and click on the desired slot
    const slotFound = await findAndClickSlot(page, courtNumber, startTime);
    if (!slotFound) {
        throw new Error(`Time slot at ${startTime} on court ${courtNumber} not found or not available.`);
    }

    console.log ("Waiting for booking dialog");
    await delay(3000);

    // Add partner to the booking
    await addPartnerToBooking(page, partnerName, partnerMembershipNumber);

    // Click 'Save' to confirm booking
    await confirmBooking(page);

    return 'Court reserved successfully';
}

app.post('/api/v1/reserve-court', async (req, res) => {
    const { error, value } = reservationSchema.validate(req.body);

    if (error) {
        return res.status(400).send({ error: error.details[0].message });
    }

    const { day, courtNumber, startTime, partnerName, partnerMembershipNumber } = value;
    const browser = await puppeteer.launch({ headless: true,
                                             args: [
                                                 '--no-sandbox',
                                                 '--disable-setuid-sandbox'
                                             ]});
    const page = await browser.newPage();

    try {
        await login(page);
        const result = await reserveCourt(page, day, courtNumber, startTime, partnerName, partnerMembershipNumber);
        res.send({ success: true, message: result });
    } catch (error) {
        console.error('An error occurred:', error);
        if (error.message.includes('Booking restricted')) {
            // Specific response for restriction errors
            res.status(403).send({ success: false, error: 'Booking restricted due to club policy.' });
        } else {
            // General error response for other errors
            res.status(500).send({ success: false, error: 'An error occurred while reserving the court.' });
        }
    } finally {
        await browser.close();
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
