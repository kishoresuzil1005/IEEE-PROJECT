# lambda_src/service_creation_notifier.py
import json
import os
import boto3
from datetime import datetime, timedelta
import secrets

# Initialize AWS clients
sns_client = boto3.client('sns')
dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE_NAME')
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
api_gateway_url_prefix = os.environ.get('API_GATEWAY_URL_PREFIX')
confirmation_validity_hours = float(os.environ.get('CONFIRMATION_VALIDITY_HOURS', '1')) # Default to 1 hour

table = dynamodb.Table(table_name)

def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")

    # Extract relevant details from CloudTrail event
    detail = event.get('detail', {})
    event_name = detail.get('eventName')
    event_source = detail.get('eventSource')
    user_identity = detail.get('userIdentity', {})
    event_time = detail.get('eventTime')
    request_parameters = detail.get('requestParameters', {})
    response_elements = detail.get('responseElements', {})
    aws_account_id = detail.get('recipientAccountId')
    aws_region = detail.get('awsRegion')

    creator_arn = user_identity.get('arn', 'N/A')
    creator_type = user_identity.get('type', 'N/A')
    creator_name = user_identity.get('userName', user_identity.get('sessionContext', {}).get('sessionIssuer', {}).get('userName', 'N/A'))

    service_id = None
    resource_type = "Unknown"
    resource_arn = "N/A"

    # --- Identify the created service based on eventName/Source ---
    if event_source == "ec2.amazonaws.com" and event_name == "RunInstances":
        resource_type = "EC2 Instance"
        instance_ids = [i['instanceId'] for i in response_elements.get('instancesSet', {}).get('items', [])]
        if instance_ids:
            service_id = instance_ids[0] # Use first instance ID for simplicity
            resource_arn = f"arn:aws:ec2:{aws_region}:{aws_account_id}:instance/{service_id}"
    elif event_source == "s3.amazonaws.com" and event_name == "CreateBucket":
        resource_type = "S3 Bucket"
        bucket_name = request_parameters.get('bucketName')
        if bucket_name:
            service_id = bucket_name
            resource_arn = f"arn:aws:s3:::{service_id}"
    elif event_source == "lambda.amazonaws.com" and event_name == "CreateFunction":
        resource_type = "Lambda Function"
        function_name = request_parameters.get('functionName')
        if function_name:
            service_id = function_name
            resource_arn = f"arn:aws:lambda:{aws_region}:{aws_account_id}:function:{service_id}"
    elif event_source == "rds.amazonaws.com" and event_name == "CreateDBInstance":
        resource_type = "RDS DB Instance"
        db_instance_identifier = request_parameters.get('dBInstanceIdentifier')
        if db_instance_identifier:
            service_id = db_instance_identifier
            resource_arn = f"arn:aws:rds:{aws_region}:{aws_account_id}:db:{service_id}"
    # Add more service type detections here as needed

    if not service_id:
        print(f"Could not identify service ID for event: {event_name} from {event_source}. Skipping.")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Service ID not found, skipped notification.'})
        }

    confirmation_token = secrets.token_urlsafe(32) # Generate a secure token
    confirmation_link = f"{api_gateway_url_prefix}/confirm?serviceId={service_id}&confirmationToken={confirmation_token}"
    
    # Calculate expiration for the confirmation token
    expiration_time = datetime.now() + timedelta(hours=confirmation_validity_hours)
    # Schedule shutdown time based on 10 PM IST (16:30 UTC) today if created before, or tomorrow if after.
    # This logic assumes the shutdown scheduler runs at 10 PM IST.
    # The actual shutdown will be handled by the scheduler checking the status.

    # Store service details in DynamoDB
    try:
        table.put_item(
            Item={
                'ServiceId': service_id,
                'ResourceType': resource_type,
                'ResourceARN': resource_arn,
                'CreatorUserARN': creator_arn,
                'CreatorName': creator_name,
                'CreationTimestamp': event_time, # CloudTrail event time is already ISO 8601
                'ConfirmationStatus': 'Pending',
                'ConfirmationToken': confirmation_token,
                'ConfirmationTokenExpires': expiration_time.isoformat(), # Store ISO formatted string
                'AWSRegion': aws_region,
                'AWSAccountId': aws_account_id,
                'LastNotificationSent': datetime.now().isoformat() # Track last notification
            }
        )
        print(f"Stored service {service_id} in DynamoDB with status 'Pending'.")
    except Exception as e:
        print(f"Error storing in DynamoDB: {e}")
        raise

    # Send SNS notification
    subject = f"ACTION REQUIRED: New AWS {resource_type} Created - {service_id}"
    message = f"""
Dear AWS User,

A new AWS {resource_type} ({service_id}) was created in your account ({aws_account_id}) in the {aws_region} region.
Created by: {creator_name} ({creator_arn})
Creation Time (UTC): {event_time}
Resource ARN: {resource_arn}

To confirm this service and prevent it from being stopped, please click the link below within {confirmation_validity_hours} hour(s):
{confirmation_link}

If you do not confirm within the specified time, this service may be automatically stopped/terminated.

Thank you,
Your AWS Automation Team
"""
    try:
        response = sns_client.publish(
            TopicArn=sns_topic_arn,
            Subject=subject,
            Message=message
        )
        print(f"SNS notification sent for service {service_id}. MessageId: {response['MessageId']}")
    except Exception as e:
        print(f"Error sending SNS notification: {e}")
        # Consider DLQ here

    return {
        'statusCode': 200,
        'body': json.dumps({'message': f'Notification sent for {resource_type} {service_id}'})
    }
