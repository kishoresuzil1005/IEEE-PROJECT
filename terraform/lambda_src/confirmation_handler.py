# lambda_src/confirmation_handler.py
import json
import os
import boto3
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE_NAME')
table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    print(f"Received event for confirmation: {json.dumps(event)}")

    query_string_parameters = event.get('queryStringParameters', {})
    service_id = query_string_parameters.get('serviceId')
    confirmation_token = query_string_parameters.get('confirmationToken')

    if not service_id or not confirmation_token:
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'text/html'},
            'body': '<h1>Error: Missing serviceId or confirmationToken.</h1>'
        }

    try:
        response = table.get_item(Key={'ServiceId': service_id})
        item = response.get('Item')

        if not item:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'text/html'},
                'body': f'<h1>Error: Service ID "{service_id}" not found.</h1>'
            }

        if item.get('ConfirmationToken') != confirmation_token:
            return {
                'statusCode': 403,
                'headers': {'Content-Type': 'text/html'},
                'body': '<h1>Error: Invalid confirmation token.</h1>'
            }

        if item.get('ConfirmationStatus') == 'Confirmed':
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'text/html'},
                'body': f'<h1>Service "{service_id}" was already confirmed! No action needed.</h1>'
            }

        token_expires_str = item.get('ConfirmationTokenExpires')
        if token_expires_str:
            token_expiration = datetime.fromisoformat(token_expires_str)
            if datetime.now() > token_expiration:
                return {
                    'statusCode': 403,
                    'headers': {'Content-Type': 'text/html'},
                    'body': '<h1>Error: Confirmation link has expired. Service may be subject to automated shutdown.</h1>'
                }

        # Update status to Confirmed
        table.update_item(
            Key={'ServiceId': service_id},
            UpdateExpression="SET ConfirmationStatus = :s, ConfirmedAt = :t",
            ExpressionAttributeValues={
                ':s': 'Confirmed',
                ':t': datetime.now().isoformat()
            }
        )

        print(f"Service {service_id} confirmed successfully.")

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'text/html'},
            'body': f'<h1>Service "{service_id}" has been successfully confirmed! It will not be stopped.</h1>'
        }

    except Exception as e:
        print(f"Error processing confirmation: {e}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'text/html'},
            'body': f'<h1>Internal Server Error: {e}</h1>'
        }
