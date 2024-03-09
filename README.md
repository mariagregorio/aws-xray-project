# AWS XRAY Project

This project uses Serverless Framework and AWS.
You will need to have Serverless CLI installed.
Make sure to export AWS_PROFILE with the desired AWS profile to deploy to

Get API key for currency API 
https://api.freecurrencyapi.com

Env vars
Create .env file in root and iclude the following env vars
- `CURRENCY_API_KEY`

Build
- `npm run build`

Deploy
- `cd dist`
- `serverless deploy`