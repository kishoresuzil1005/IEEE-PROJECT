# main.tf - Consolidated, Corrected, and Updated again (CloudTrail simplification)

# --- Terraform Configuration ---
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # Backend configuration (e.g., S3 for remote state)
  # For local state, you can omit this block.
  # For production, always use a remote backend with state locking.
  backend "s3" {
    bucket         = "kishoresuzil-tfstate-us-east-1-unique" # Replace with YOUR UNIQUE S3 bucket name
    key            = "service-enforcer/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    use_lockfile   = true
  }
}

# --- AWS Provider Configuration ---
provider "aws" {
  region = var.aws_region
}

# --- Variables ---
variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "us-east-1" # Updated to US East (N. Virginia)
}

variable "notification_email" {
  description = "Email address to send service creation notifications and confirmations to."
  type        = string
  default     = "kishoresuzil1005@gmail.com" # Updated to your email address
}

variable "environment_tag" {
  description = "Environment tag for resources."
  type        = string
  default     = "dev"
}

variable "project_tag" {
  description = "Project tag for resources."
  type        = string
  default     = "AutoServiceEnforcer"
}

variable "confirmation_validity_hours" {
  description = "How many hours the confirmation link is valid for before shutdown checks begin."
  type        = number
  default     = 0.5 # 30 minutes for testing
}

variable "shutdown_start_hour_utc" {
  description = "UTC hour for the start of the shutdown window (Adjusted for us-east-1, e.g., 6 PM ET = 22 UTC)"
  type        = number
  default     = 22 # Example: 6 PM ET is 22:00 UTC. Adjust as per your desired local time.
}

variable "shutdown_end_hour_utc" {
  description = "UTC hour for the end of the shutdown window (Adjusted for us-east-1, e.g., 10 PM ET = 02 UTC next day)"
  type        = number
  default     = 2 # Example: 10 PM ET (on day 1) is 02:00 UTC (on day 2). Adjust as per your desired local time.
}

# --- Data Sources ---
data "archive_file" "service_creation_notifier_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_src/service_creation_notifier.py"
  output_path = "${path.module}/lambda_src/service_creation_notifier.zip"
}

data "archive_file" "confirmation_handler_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_src/confirmation_handler.py"
  output_path = "${path.module}/lambda_src/confirmation_handler.zip"
}

data "archive_file" "service_stopper_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_src/service_stopper.py"
  output_path = "${path.module}/lambda_src/service_stopper.zip"
}

data "aws_caller_identity" "current" {}

# --- IAM Roles and Policies ---
resource "aws_iam_role" "lambda_execution_role" {
  name_prefix = "lambda-service-enforcer-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_iam_role_policy" "lambda_cloudwatch_logs_policy" {
  name   = "LambdaCloudWatchLogsPolicy"
  role   = aws_iam_role.lambda_execution_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/*:*"
      },
    ]
  })
}

resource "aws_iam_role_policy" "lambda_sns_publish_policy" {
  name   = "LambdaSNSPublishPolicy"
  role   = aws_iam_role.lambda_execution_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "sns:Publish"
        Resource = aws_sns_topic.service_creation_alerts.arn
      },
    ]
  })
}

resource "aws_iam_role_policy" "lambda_dynamodb_access_policy" {
  name   = "LambdaDynamoDBAccessPolicy"
  role   = aws_iam_role.lambda_execution_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan",
          "dynamodb:Query",
        ]
        Resource = aws_dynamodb_table.service_status_table.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable"
        ]
        Resource = aws_dynamodb_table.service_status_table.arn
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_service_stopper_policy" {
  name   = "LambdaServiceStopperPolicy"
  role   = aws_iam_role.lambda_execution_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ec2:StopInstances",
          "ec2:TerminateInstances", # Be very careful with TerminateInstances
          "s3:DeleteObject",        # Be very careful with S3 deletions
          "s3:DeleteBucket",        # Be VERY careful with S3 deletions
          "s3:ListBucket",          # Needed to check if bucket is empty before deleting
          "lambda:DeleteFunction",
          "rds:DeleteDBInstance",
          "rds:StopDBInstance",
          "ec2:DescribeInstances", # Needed to get instance state/details
          "s3:GetBucketTagging",
          "lambda:GetFunctionConfiguration",
          "rds:DescribeDBInstances"
        ]
        Resource = "*" # Fine-grain this in production if possible (e.g., via tags)
      },
    ]
  })
}

resource "aws_iam_role" "eventbridge_lambda_role" {
  name_prefix = "eventbridge-lambda-invoke-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "eventbridge_lambda_invoke_policy" {
  name   = "EventBridgeLambdaInvokePolicy"
  role   = aws_iam_role.eventbridge_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.service_creation_notifier.arn
      },
    ]
  })
}

resource "aws_iam_role" "scheduler_lambda_role" {
  name_prefix = "scheduler-lambda-invoke-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "scheduler_lambda_invoke_policy" {
  name   = "SchedulerLambdaInvokePolicy"
  role   = aws_iam_role.scheduler_lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.shutdown_scheduler.arn
      },
    ]
  })
}

resource "aws_iam_role" "api_gateway_lambda_invoke_role" {
  name_prefix = "api-gateway-lambda-invoke-"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "api_gateway_lambda_invoke_policy" {
  name   = "ApiGatewayLambdaInvokePolicy"
  role   = aws_iam_role.api_gateway_lambda_invoke_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = aws_lambda_function.confirmation_handler.arn
      },
    ]
  })
}

# --- S3 Bucket for CloudTrail Logs ---
resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket_prefix = "cloudtrail-logs-${data.aws_caller_identity.current.account_id}-"
  force_destroy = true # Be careful with this in production environments!

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_s3_bucket_versioning" "cloudtrail_logs_versioning" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_policy" "cloudtrail_s3_bucket_policy" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail_logs.arn
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
    ]
  })
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs_public_access_block" {
  bucket                  = aws_s3_bucket.cloudtrail_logs.id
  block_public_acls       = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- CloudTrail Configuration ---
resource "aws_cloudtrail" "service_creation_trail" {
  name                          = "service-creation-audit-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  is_multi_region_trail         = true # Capture events from all regions
  include_global_service_events = true # This ensures global service events (like IAM) are included
  enable_logging                = true

  # REMOVED the advanced_event_selector block entirely.
  # The filtering for specific events (RunInstances, CreateBucket, etc.)
  # will now be done solely by the EventBridge rule:
  # aws_cloudwatch_event_rule.service_creation_event_rule
  # which already has the correct "detail.eventName" filter.

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

# --- EventBridge Configuration ---
resource "aws_cloudwatch_event_rule" "service_creation_event_rule" {
  name        = "ServiceCreationEventRule"
  description = "Captures CloudTrail events for service creation to trigger Lambda."

  event_pattern = jsonencode({
    "source": ["aws.ec2", "aws.s3", "aws.lambda", "aws.rds", "aws.dynamodb", "aws.ecr", "aws.ecs", "aws.eks", "aws.iam", "aws.vpc"], # Add more service sources
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventName": [
        "RunInstances",
        "CreateBucket",
        "CreateFunction",
        "CreateDBInstance",
        "CreateCluster",
        "CreateTable",
        "CreateVpc",
        "CreateSubnet",
        "CreateInternetGateway",
        "CreateNatGateway",
        "CreateRole",
        "CreateUser",
        "CreatePolicy",
        "CreateGroup"
      ]
    }
  })

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_cloudwatch_event_target" "service_creation_lambda_target" {
  rule      = aws_cloudwatch_event_rule.service_creation_event_rule.name
  arn       = aws_lambda_function.service_creation_notifier.arn
  role_arn  = aws_iam_role.eventbridge_lambda_role.arn
}

resource "aws_lambda_permission" "allow_eventbridge_to_invoke_notifier" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.service_creation_notifier.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.service_creation_event_rule.arn
}

# --- SNS Topic ---
resource "aws_sns_topic" "service_creation_alerts" {
  name = "service-creation-alerts-${var.environment_tag}"

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_sns_topic_subscription" "email_subscription" {
  topic_arn = aws_sns_topic.service_creation_alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
  # You will receive a confirmation email to the endpoint.
  # You must click the confirmation link in that email for the subscription to be active.
}

# --- DynamoDB Table ---
resource "aws_dynamodb_table" "service_status_table" {
  name           = "ServiceStatusTable-${var.environment_tag}"
  billing_mode   = "PAY_PER_REQUEST" # On-demand capacity
  hash_key       = "ServiceId"

  attribute {
    name = "ServiceId"
    type = "S"
  }

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

# --- Lambda Functions ---
resource "aws_lambda_function" "service_creation_notifier" {
  function_name = "ServiceCreationNotifier-${var.environment_tag}"
  handler       = "service_creation_notifier.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_execution_role.arn
  filename      = data.archive_file.service_creation_notifier_zip.output_path
  source_code_hash = data.archive_file.service_creation_notifier_zip.output_base64sha256
  timeout       = 30
  memory_size   = 128

  environment {
    variables = {
      SNS_TOPIC_ARN          = aws_sns_topic.service_creation_alerts.arn
      DYNAMODB_TABLE_NAME    = aws_dynamodb_table.service_status_table.name
      API_GATEWAY_URL_PREFIX = aws_api_gateway_stage.confirmation_api_stage.invoke_url
      CONFIRMATION_VALIDITY_HOURS = var.confirmation_validity_hours
    }
  }

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_lambda_function" "confirmation_handler" {
  function_name = "ConfirmationHandler-${var.environment_tag}"
  handler       = "confirmation_handler.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_execution_role.arn
  filename      = data.archive_file.confirmation_handler_zip.output_path
  source_code_hash = data.archive_file.confirmation_handler_zip.output_base64sha256
  timeout       = 30
  memory_size   = 128

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.service_status_table.name
    }
  }

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_lambda_function" "shutdown_scheduler" {
  function_name = "ShutdownScheduler-${var.environment_tag}"
  handler       = "service_stopper.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_execution_role.arn
  filename      = data.archive_file.service_stopper_zip.output_path
  source_code_hash = data.archive_file.service_stopper_zip.output_base64sha256
  timeout       = 60
  memory_size   = 128

  environment {
    variables = {
      DYNAMODB_TABLE_NAME    = aws_dynamodb_table.service_status_table.name
      SNS_TOPIC_ARN          = aws_sns_topic.service_creation_alerts.arn
      API_GATEWAY_URL_PREFIX = aws_api_gateway_stage.confirmation_api_stage.invoke_url
      SHUTDOWN_START_HOUR_UTC = var.shutdown_start_hour_utc
      SHUTDOWN_END_HOUR_UTC   = var.shutdown_end_hour_utc
    }
  }

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

# --- API Gateway ---
resource "aws_api_gateway_rest_api" "confirmation_api" {
  name        = "ServiceConfirmationAPI-${var.environment_tag}"
  description = "API for confirming AWS service creation."

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_api_gateway_resource" "confirmation_resource" {
  rest_api_id = aws_api_gateway_rest_api.confirmation_api.id
  parent_id   = aws_api_gateway_rest_api.confirmation_api.root_resource_id
  path_part   = "confirm"
}

resource "aws_api_gateway_method" "confirmation_get_method" {
  rest_api_id   = aws_api_gateway_rest_api.confirmation_api.id
  resource_id   = aws_api_gateway_resource.confirmation_resource.id
  http_method   = "GET"
  authorization = "NONE"

  request_parameters = {
    "method.request.querystring.serviceId"      = true
    "method.request.querystring.confirmationToken" = true
  }
}

resource "aws_api_gateway_integration" "confirmation_lambda_integration" {
  rest_api_id             = aws_api_gateway_rest_api.confirmation_api.id
  resource_id             = aws_api_gateway_resource.confirmation_resource.id
  http_method             = aws_api_gateway_method.confirmation_get_method.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.confirmation_handler.invoke_arn
  credentials             = aws_iam_role.api_gateway_lambda_invoke_role.arn
}

resource "aws_api_gateway_deployment" "confirmation_api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.confirmation_api.id

  lifecycle {
    create_before_destroy = true
  }

  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_resource.confirmation_resource.id,
      aws_api_gateway_method.confirmation_get_method.id,
      aws_api_gateway_integration.confirmation_lambda_integration.id,
    ]))
  }
}

# --- NEW RESOURCE: aws_api_gateway_stage for API Gateway ---
resource "aws_api_gateway_stage" "confirmation_api_stage" {
  deployment_id = aws_api_gateway_deployment.confirmation_api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.confirmation_api.id
  stage_name    = "prod"

  tags = {
    Environment = var.environment_tag
    Project     = var.project_tag
  }
}

resource "aws_lambda_permission" "allow_api_gateway_to_invoke_confirmation" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.confirmation_handler.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.confirmation_api.execution_arn}/*/*"
}

# --- Scheduled Shutdown (EventBridge Scheduler) ---
resource "aws_scheduler_schedule" "hourly_shutdown_check" {
  name_prefix = "hourly-shutdown-check-"
  group_name  = "default"

  # Example: If you want to run between 6 PM and 10 PM ET (Eastern Time - UTC-4/5)
  # 6 PM ET = 22:00 UTC
  # 10 PM ET = 02:00 UTC (next day)
  # So, the schedule would be '30 22-2 * * ? *' for runs at 22:30, 23:30, 00:30, 01:30 UTC
  schedule_expression       = "cron(30 ${var.shutdown_start_hour_utc}-${var.shutdown_end_hour_utc} * * ? *)"
  schedule_expression_timezone = "UTC" # Cron expressions are always in UTC

  flexible_time_window {
    mode = "OFF" # Exact time, no flexibility
  }

  target {
    arn      = aws_lambda_function.shutdown_scheduler.arn
    role_arn = aws_iam_role.scheduler_lambda_role.arn
    input    = jsonencode({"triggered_by": "hourly_schedule", "timestamp": "$$"})
  }
}

resource "aws_lambda_permission" "allow_scheduler_to_invoke_shutdown" {
  statement_id  = "AllowExecutionFromScheduler"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.shutdown_scheduler.function_name
  principal     = "scheduler.amazonaws.com"
  source_arn    = aws_scheduler_schedule.hourly_shutdown_check.arn
}

# --- Outputs ---
output "api_gateway_confirmation_url" {
  description = "The URL for the API Gateway confirmation endpoint."
  value       = aws_api_gateway_stage.confirmation_api_stage.invoke_url
}

output "sns_topic_arn" {
  description = "The ARN of the SNS topic for notifications."
  value       = aws_sns_topic.service_creation_alerts.arn
}

output "dynamodb_table_name" {
  description = "The name of the DynamoDB table."
  value       = aws_dynamodb_table.service_status_table.name
}

output "cloudtrail_s3_bucket_name" {
  description = "The S3 bucket name where CloudTrail logs are stored."
  value       = aws_s3_bucket.cloudtrail_logs.id
}
