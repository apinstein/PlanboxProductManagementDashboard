#!/bin/bash
s3cmd sync --exclude='.git/*' ./ s3://dev.cloud.tourbuzz.net/planbox-product-management/
