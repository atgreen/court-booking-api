# court-booking-api
> An experimental API for booking tennis courts through browser automation

`court-booking-api` is an experimental API implementation that
automates interactions with a tennis club's website to book
courts. The website typically requires a traditional web browser for
access. This project uses a headless Chrome browser, controlled via
Puppeteer, to interface with the website programmatically. It provides
two main API endpoints:

* `/api/v1/open-courts`: provide a list of available courts for a given day
* `/api/v1/reserve-court`: reserve a court for a specific time

I won't go into documenting these APIs, as I suspect they are only of
interest to me.  I share this repo in the hopes that it would be of
use to others wanting to wrap APIs around traditional web properties.

## Author and License

`court-booking-api` was written by [Anthony
Green](https://github.com/atgreen), and is distributed under the terms
of the MIT License.  See
[LICENSE](https://raw.githubusercontent.com/atgreen/green-orb/main/LICENSE)
for details.
