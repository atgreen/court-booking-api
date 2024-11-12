# court-booking-api
> An API for a tennis club's website

This is an experimental API implementation for my tennis club's
website for booking courts.  The website is normally only accessible
through a traditional web browser.  This API implementation uses a
headless chrome browser to interface with the website, and provides
two API endpoints:

* `/api/v1/open-courts`: provide a list of available courts for a given day
* `/api/v1/reserve-court`: reserve a specific court

I won't go into documenting these APIs, as I suspect they are only of
interest to me.  I share this repo in the hopes that it would be of
use to others wanting to wrap APIs around traditional web properties.

## Author and License

`court-booking-api` was written by [Anthony
Green](https://github.com/atgreen), and is distributed under the terms
of the MIT License.  See
[LICENSE](https://raw.githubusercontent.com/atgreen/green-orb/main/LICENSE)
for details.
