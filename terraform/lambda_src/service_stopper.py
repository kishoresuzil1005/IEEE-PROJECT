# lambda_src/service_stopper.py
import json
import os
import boto3
from datetime import datetime, timedelta

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMODB_TABLE_NAME')
sns_topic_arn = os.environ.get('SNS_TOPIC_ARN')
api_gateway_url_prefix = os.environ.get('API_GATEWAY_URL_PREFIX')

table = dynamodb.Table(table_name)
sns_client = boto3.client('sns')
ec2_client = boto3.client('ec2')
s3_client = boto3.client('s3')
lambda_client = boto3.client('lambda')
rds_client = boto3.client('rds')

SHUTDOWN_START_HOUR_UTC = int(os.environ.get('SHUTDOWN_START_HOUR_UTC', '12'))
SHUTDOWN_END_HOUR_UTC = int(os.environ.get('SHUTDOWN_END_HOUR_UTC', '16'))


def send_notification(service_item, subject, message):
    try:
        response = sns_client.publish(
            TopicArn=sns_topic_arn,
            Subject=subject,
            Message=message
        )
        print(f"SNS notification sent for service {service_item['ServiceId']}. MessageId: {response['MessageId']}")
    except Exception as e:
        print(f"Error sending SNS notification for {service_item['ServiceId']}: {e}")

def stop_aws_service(service_item):
    service_id = service_item['ServiceId']
    resource_type = service_item['ResourceType']
    aws_region = service_item['AWSRegion']
    creator_name = service_item['CreatorName']
    creator_arn = service_item['CreatorUserARN']

    status = "Stopped"
    message = ""

    try:
        if resource_type == "EC2 Instance":
            ec2_client.stop_instances(InstanceIds=[service_id], DryRun=False)
            message = f"EC2 Instance '{service_id}' in region '{aws_region}' has been stopped."
            print(message)
        elif resource_type == "S3 Bucket":
            # WARNING: Deleting S3 buckets can lead to data loss.
            # This example attempts to delete, but for production,
            # consider more robust checks (e.g., bucket empty?) or just tag for review.
            objects = s3_client.list_objects_v2(Bucket=service_id)
            if 'Contents' in objects and len(objects['Contents']) > 0:
                print(f"S3 Bucket '{service_id}' is not empty. Cannot delete automatically. Please review.")
                status = "Skipped_Not_Empty"
                message = f"S3 Bucket '{service_id}' in region '{aws_region}' was marked for shutdown but is not empty. Manual review required. It was NOT deleted."
            else:
                s3_client.delete_bucket(Bucket=service_id)
                message = f"S3 Bucket '{service_id}' in region '{aws_region}' has been deleted."
                print(message)
                status = "Terminated" # More accurate for S3 deletion
        elif resource_type == "Lambda Function":
            lambda_client.delete_function(FunctionName=service_id)
            message = f"Lambda Function '{service_id}' in region '{aws_region}' has been deleted."
            print(message)
            status = "Terminated"
        elif resource_type == "RDS DB Instance":
            rds_client.stop_db_instance(DBInstanceIdentifier=service_id) # Or delete_db_instance if preferred
            message = f"RDS DB Instance '{service_id}' in region '{aws_region}' has been stopped."
            print(message)
        else:
            status = "Skipped_Unsupported_Type"
            message = f"Service '{service_id}' of type '{resource_type}' is not supported for automated stopping. Manual review required."
            print(message)

    except Exception as e:
        status = "Failed_To_Stop"
        message = f"Failed to stop/terminate {resource_type} '{service_id}': {e}"
        print(message)
        # Re-raise to indicate failure to the scheduler if needed for retries
        # raise

    # Update DynamoDB status
    table.update_item(
        Key={'ServiceId': service_id},
        UpdateExpression="SET ConfirmationStatus = :s, LastActionTime = :t, LastActionMessage = :m",
        ExpressionAttributeValues={
            ':s': status,
            ':t': datetime.now().isoformat(),
            ':m': message
        }
    )

    # Send final notification
    subject = f"AWS Service Action: {status} - {resource_type} {service_id}"
    full_message = f"""
Dear AWS User,

The AWS {resource_type} ({service_id}) created by {creator_name} ({creator_arn}) in region {aws_region}
has been processed by the automated enforcement system.

Status: {status}
Details: {message}

If this was unexpected, please review your confirmation process.

Thank you,
Your AWS Automation Team
"""
    send_notification(service_item, subject, full_message)

def lambda_handler(event, context):
    print(f"Received scheduled event: {json.dumps(event)}")
    current_utc_time = datetime.utcnow()
    current_hour_utc = current_utc_time.hour
    current_minute_utc = current_utc_time.minute

    # Check if current time is within the 6 PM - 10 PM IST window (12:30 UTC - 16:30 UTC)
    # This Lambda is triggered by EventBridge Scheduler hourly at :30 UTC for these hours.
    if not (SHUTDOWN_START_HOUR_UTC <= current_hour_utc <= SHUTDOWN_END_HOUR_UTC and current_minute_utc >= 30):
        print(f"Not within the scheduled shutdown window (UTC {current_hour_utc}:{current_minute_utc}). Skipping.")
        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Not in scheduled window.'})
        }

    try:
        # Scan for pending services that have passed their confirmation expiry
        # A more efficient way would be to use a GSI with status and expiration time if high volume
        response = table.scan(
            FilterExpression=f"ConfirmationStatus = :pending_status",
            ExpressionAttributeValues={
                ':pending_status': 'Pending'
            }
        )
        pending_services = response.get('Items', [])

        for service_item in pending_services:
            service_id = service_item['ServiceId']
            resource_type = service_item['ResourceType']
            creation_timestamp_str = service_item['CreationTimestamp']
            confirmation_expires_str = service_item['ConfirmationTokenExpires']

            creation_time = datetime.fromisoformat(creation_timestamp_str)
            confirmation_expiration_time = datetime.fromisoformat(confirmation_expires_str)

            print(f"Processing service: {service_id} (Type: {resource_type}, Created: {creation_time}, Expires: {confirmation_expiration_time})")

            # Check if confirmation expired
            if current_utc_time > confirmation_expiration_time:
                print(f"Confirmation for {service_id} expired at {confirmation_expiration_time.isoformat()} UTC. Triggering stop.")
                stop_aws_service(service_item) # Call the function to stop the service
            else:
                # Send reminder if it's within the window but not expired yet, and a reminder hasn't been sent recently
                # Or if it's the last check before 10 PM IST (e.g., 9:30 PM IST check)
                last_notification_sent_str = service_item.get('LastNotificationSent')
                last_notification_sent = datetime.fromisoformat(last_notification_sent_str) if last_notification_sent_str else datetime.min

                # Send reminder if not confirmed and last reminder was more than e.g., 30 mins ago
                # And if it's not yet the final shutdown hour (10 PM IST)
                if current_utc_time - last_notification_sent > timedelta(minutes=30) and current_hour_utc < SHUTDOWN_END_HOUR_UTC:
                    print(f"Sending reminder for {service_id}.")
                    confirmation_link = f"{api_gateway_url_prefix}/confirm?serviceId={service_id}&confirmationToken={service_item['ConfirmationToken']}"
                    subject = f"REMINDER: Confirm Your AWS {resource_type} - {service_id}"
                    message = f"""
Dear AWS User,

This is a reminder that your AWS {resource_type} ({service_id}) in region {service_item['AWSRegion']} requires confirmation.
Created by: {service_item['CreatorName']}
Confirmation expires on: {confirmation_expiration_time.isoformat()} UTC

Please confirm by clicking this link:
{confirmation_link}

If not confirmed, this service may be stopped automatically.

Thank you,
Your AWS Automation Team
"""
                    send_notification(service_item, subject, message)
                    table.update_item(
                        Key={'ServiceId': service_id},
                        UpdateExpression="SET LastNotificationSent = :t",
                        ExpressionAttributeValues={
                            ':t': datetime.now().isoformat()
                        }
                    )
                else:
                    print(f"Service {service_id} is pending but not expired and no reminder needed yet.")

    except Exception as e:
        print(f"Error in ShutdownScheduler Lambda: {e}")
        raise # Re-raise to ensure CloudWatch Logs capture the error

    return {
        'statusCode': 200,
        'body': json.dumps({'message': 'Shutdown scheduler processed pending services.'})
    }
