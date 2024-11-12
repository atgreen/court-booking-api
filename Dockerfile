FROM registry.access.redhat.com/ubi9/nodejs-20

USER 0

# Install chrome dependencies
RUN dnf -y install nss alsa-lib atk at-spi2-atk at-spi2-core \
    	   	   avahi-libs bzip2-libs cairo cups dbus-libs expat \
    	   	   fontconfig freetype fribidi glib2 glibc gmp \
    	   	   gnutls graphite2 harfbuzz keyutils-libs krb5-libs \
    	   	   libblkid libbrotli libcap libcom_err libdatrie \
    	   	   libdrm libffi libgcc libidn2 libmount libpng \
    	   	   libselinux libtasn1 libthai libunistring \
    	   	   libwayland-server libX11 libXau libxcb \
    	   	   libXcomposite libXdamage libXext libXfixes libXi \
    	   	   libxkbcommon libxml2 libXrandr libXrender libzstd \
    	   	   lz4-libs mesa-libgbm nettle nspr nss nss-util \
    	   	   openssl-libs p11-kit pango pcre2 pixman \
    	   	   systemd-libs xz-libs

USER 1001

RUN npm install puppeteer express dotenv async-retry joi

COPY court-booking-api.js /opt/app-root/src/court-booking-api.js

CMD node /opt/app-root/src/court-booking-api.js
EXPOSE 3000
