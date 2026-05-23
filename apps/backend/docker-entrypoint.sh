#!/bin/bash
set -e

case "$1" in
    gunicorn*)
        echo "Running database migrations..."
        python manage.py migrate --noinput
        echo "Collecting static files..."
        python manage.py collectstatic --noinput
        ;;
esac

exec "$@"
