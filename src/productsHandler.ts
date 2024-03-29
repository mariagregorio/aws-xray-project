import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import AWSXRay from 'aws-xray-sdk-core';

export const client = AWSXRay.captureAWSv3Client(new DynamoDBClient({ region: 'us-east-1' }));

type ProxyHandler = Handler<APIGatewayProxyEvent, APIGatewayProxyResult>;

export const handler: ProxyHandler = async (event, _context) => {
    const { httpMethod, body } = event;
    switch (httpMethod) {
        case 'POST':
            if (body) {
                const parsedBody = JSON.parse(body);
                validateBody(parsedBody);
                const product: Product = {
                    id: uuidv4(),
                    name: parsedBody.name,
                    price: parsedBody.price.value,
                };
                if (parsedBody.price.currency !== 'USD') {
                    const segment = AWSXRay.getSegment();
                    const subsegment = segment?.addNewSubsegment('CurrencyAPIcall');
                    subsegment?.addAnnotation('currency', parsedBody.price.currency);
                    try {
                        const convertedPrice = await convertCurrency(parsedBody.price.currency, parsedBody.price.value);
                        if (!convertedPrice) throw new Error('Currency convertion result is undefined');
                        product.price = convertedPrice;
                    } catch (e) {
                        console.error('error while fetching currencies', e);
                        subsegment?.addError(`Error on currency convertion API call ${JSON.stringify(e)}`);
                        return { statusCode: 500, body: 'Internal error' };
                    } finally {
                        subsegment?.close();
                    }
                }
                try {
                    await saveProduct(product);
                } catch (e) {
                    console.error('error while saving product', e);
                    return { statusCode: 500, body: 'Internal error' };
                }
                return { statusCode: 200, body: JSON.stringify(product) };
            }
            return { statusCode: 422, body: 'Empty body' };
        default:
            break;
    }
    return { statusCode: 404, body: 'Resource not found' };
};

const validateBody = (body: any): APIGatewayProxyResult | void => {
    if (!body.name || body.name === '')
        return { statusCode: 400, body: 'Bad request, no name provided' };
    if (!body.price) return { statusCode: 400, body: 'Bad request, no price provided' };
    if (body.price && !body.price.value)
        return { statusCode: 400, body: 'Bad request, no price value provided' };
    if (typeof body.price.value !== 'number')
        return { statusCode: 400, body: 'Bad request, price value must be a number' };
    if (body.price && !body.price.currency)
        return { statusCode: 400, body: 'Bad request, no price currency provided' };
};

const saveProduct = async (product: Product): Promise<void> => {
    await client.send(
        new PutItemCommand({
            TableName: 'Products',
            Item: {
                id: { S: product.id },
                name: { S: product.name },
                price: { N: String(product.price) },
            },
        })
    );
};

const convertCurrency = async (
    bodyCurrency: string,
    bodyPriceValue: number
): Promise<number | undefined> => {
    const currenciesResponse = await axios.get(
        `https://api.freecurrencyapi.com/v1/latest?apikey=${process.env.CURRENCY_API_KEY}&currencies=`
    );
    if (currenciesResponse.data && currenciesResponse.data.data) {
        const currencies = currenciesResponse.data.data;
        for (const key of Object.keys(currencies)) {
            if (bodyCurrency === key) {
                return bodyPriceValue / currencies[key];
            }
        }
    }
    return undefined;
};

type Product = {
    id: string;
    name: string;
    price: number;
};
