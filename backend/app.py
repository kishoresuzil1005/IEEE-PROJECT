from flask import Flask, request, jsonify, render_template
import boto3
import os
from flask_cors import CORS
from datetime import datetime, timedelta

# Get the absolute path of the directory containing app.py
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Configure Flask to correctly find templates and static files.
# The 'frontend' directory contains both the index.html template and the static CSS/JS files.
app = Flask(__name__,
            static_url_path='',  # Serves static files at the root URL
            static_folder='frontend',  # The directory containing static files
            template_folder='frontend')  # The directory containing templates
CORS(app) # Enable CORS for all routes

# --- ADDED LINES FOR DEBUGGING ---
# Print the value of the environment variables for debugging purposes.
print("--- Docker Container Environment Check ---")
print(f"Checking for AWS_REGION: {os.environ.get('AWS_REGION', 'ERROR: NOT SET')}")
print(f"Checking for AWS_ACCESS_KEY_ID: {os.environ.get('AWS_ACCESS_KEY_ID', 'ERROR: NOT SET')}")
print(f"Checking for AWS_SECRET_ACCESS_KEY: {'[SET]' if os.environ.get('AWS_SECRET_ACCESS_KEY') else 'ERROR: NOT SET'}")
print("--- End Check ---")

# Get the region from the environment variable with a fallback
aws_region = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize Boto3 clients and explicitly pass the region to each client.
# This fixes the NoRegionError by ensuring the region is always defined.
ec2_client = boto3.client('ec2', region_name=aws_region)
autoscaling_client = boto3.client('autoscaling', region_name=aws_region)
elbv2_client = boto3.client('elbv2', region_name=aws_region)
elb_client = boto3.client('elb', region_name=aws_region)
ce_client = boto3.client('ce', region_name=aws_region)

# Home page (renders index.html from the configured template_folder)
@app.route('/')
def home():
    return render_template('index.html')

# --- EC2 Overview ---
@app.route('/api/ec2-overview', methods=['GET'])
def ec2_overview():
    try:
        counts = {}

        # Instances
        instances_response = ec2_client.describe_instances()
        instance_count = 0
        for reservation in instances_response['Reservations']:
            instance_count += len(reservation['Instances'])
        counts['Instances'] = instance_count

        # Auto Scaling Groups
        asg_response = autoscaling_client.describe_auto_scaling_groups()
        counts['AutoScalingGroups'] = len(asg_response['AutoScalingGroups'])

        # Capacity Reservations
        cr_response = ec2_client.describe_capacity_reservations()
        counts['CapacityReservations'] = len(cr_response['CapacityReservations'])

        # Dedicated Hosts
        dh_response = ec2_client.describe_hosts()
        counts['DedicatedHosts'] = len(dh_response['Hosts'])

        # Elastic IPs
        eips_response = ec2_client.describe_addresses()
        counts['ElasticIPs'] = len(eips_response['Addresses'])

        # Key Pairs
        kp_response = ec2_client.describe_key_pairs()
        counts['KeyPairs'] = len(kp_response['KeyPairs'])

        # Load Balancers (Combined for Classic, Application, Network)
        lb_count = 0
        try:
            elbv2_response = elbv2_client.describe_load_balancers()
            lb_count += len(elbv2_response['LoadBalancers'])
        except Exception as e:
            print(f"Error describing ELBv2: {e}") # Log error, don't fail overview

        try:
            elb_response = elb_client.describe_load_balancers()
            lb_count += len(elb_response['LoadBalancerDescriptions'])
        except Exception as e:
            print(f"Error describing Classic ELB: {e}") # Log error, don't fail overview
        counts['LoadBalancers'] = lb_count

        # Placement Groups
        pg_response = ec2_client.describe_placement_groups()
        counts['PlacementGroups'] = len(pg_response['PlacementGroups'])

        # Security Groups
        sg_response = ec2_client.describe_security_groups()
        counts['SecurityGroups'] = len(sg_response['SecurityGroups'])

        # Snapshots (owned by self)
        snapshot_response = ec2_client.describe_snapshots(OwnerIds=['self'])
        counts['Snapshots'] = len(snapshot_response['Snapshots'])

        # Volumes
        volume_response = ec2_client.describe_volumes()
        counts['Volumes'] = len(volume_response['Volumes'])

        return jsonify(counts)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EC2 Instances ---
@app.route('/api/ec2-instances', methods=['GET'])
def list_ec2_instances():
    try:
        response = ec2_client.describe_instances()
        instances = []
        for reservation in response['Reservations']:
            for instance in reservation['Instances']:
                instance_name = 'N/A'
                for tag in instance.get('Tags', []):
                    if tag['Key'] == 'Name':
                        instance_name = tag['Value']
                        break

                instances.append({
                    'Name': instance_name,
                    'InstanceId': instance['InstanceId'],
                    'State': instance['State']['Name'],
                    'InstanceType': instance['InstanceType'],
                    'PublicIpAddress': instance.get('PublicIpAddress', 'N/A'),
                    'PrivateIpAddress': instance.get('PrivateIpAddress', 'N/A'),
                    'LaunchTime': instance['LaunchTime'].isoformat() # Convert datetime object to ISO format string
                })
        return jsonify(instances)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/ec2-instance/<instance_id>/<action>', methods=['POST'])
def perform_instance_action(instance_id, action):
    try:
        if action == 'start':
            ec2_client.start_instances(InstanceIds=[instance_id])
            message = f"Instance {instance_id} is starting."
        elif action == 'stop':
            ec2_client.stop_instances(InstanceIds=[instance_id])
            message = f"Instance {instance_id} is stopping."
        elif action == 'terminate':
            ec2_client.terminate_instances(InstanceIds=[instance_id])
            message = f"Instance {instance_id} is terminating."
        else:
            return jsonify({"error": "Invalid action specified."}), 400

        return jsonify({"message": message})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Key Pairs ---
@app.route('/api/key-pairs', methods=['GET'])
def list_key_pairs():
    try:
        response = ec2_client.describe_key_pairs()
        keys = [{'KeyName': kp['KeyName'], 'KeyFingerprint': kp.get('KeyFingerprint', 'N/A')} for kp in response['KeyPairs']]
        return jsonify(keys)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/key-pair/create', methods=['POST'])
def create_key_pair():
    key_name = request.json.get('key_name')
    if not key_name:
        return jsonify({"error": "Key name is required."}), 400
    try:
        response = ec2_client.create_key_pair(KeyName=key_name)
        return jsonify({"message": f"Key pair '{key_name}' created successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/key-pair/<key_name>/delete', methods=['POST'])
def delete_key_pair(key_name):
    try:
        ec2_client.delete_key_pair(KeyName=key_name)
        return jsonify({"message": f"Key pair '{key_name}' deleted successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Security Groups ---
@app.route('/api/security-groups', methods=['GET'])
def list_security_groups():
    try:
        response = ec2_client.describe_security_groups()
        sgs = []
        for sg in response['SecurityGroups']:
            sgs.append({
                'GroupName': sg.get('GroupName'),
                'GroupId': sg.get('GroupId'),
                'Description': sg.get('Description'),
                'VpcId': sg.get('VpcId'),
                'IpPermissions': sg.get('IpPermissions', []),
                'IpPermissionsEgress': sg.get('IpPermissionsEgress', []),
            })
        return jsonify(sgs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/security-group/create', methods=['POST'])
def create_security_group():
    data = request.json
    group_name = data.get('group_name')
    description = data.get('description', '')
    vpc_id = data.get('vpc_id')

    if not group_name or not vpc_id:
        return jsonify({"error": "Group name and VPC ID are required."}), 400

    try:
        response = ec2_client.create_security_group(
            GroupName=group_name,
            Description=description,
            VpcId=vpc_id
        )
        return jsonify({"message": f"Security Group '{group_name}' created successfully with ID: {response['GroupId']}."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/security-group/<group_id>/delete', methods=['POST'])
def delete_security_group(group_id):
    try:
        ec2_client.delete_security_group(GroupId=group_id)
        return jsonify({"message": f"Security Group '{group_id}' deleted successfully."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Auto Scaling Groups ---
@app.route('/api/auto-scaling-groups', methods=['GET'])
def list_auto_scaling_groups():
    try:
        response = autoscaling_client.describe_auto_scaling_groups()
        asgs = []
        for asg in response['AutoScalingGroups']:
            asgs.append({
                'AutoScalingGroupName': asg.get('AutoScalingGroupName'),
                'MinSize': asg.get('MinSize'),
                'MaxSize': asg.get('MaxSize'),
                'DesiredCapacity': asg.get('DesiredCapacity'),
                'LaunchConfigurationName': asg.get('LaunchConfigurationName', asg.get('LaunchTemplate', {}).get('LaunchTemplateName')),
                'HealthCheckType': asg.get('HealthCheckType'),
                'HealthCheckGracePeriod': asg.get('HealthCheckGracePeriod'),
                'CreatedTime': asg.get('CreatedTime').isoformat() if asg.get('CreatedTime') else 'N/A',
                'Status': asg.get('Status', 'N/A'),
                'Instances': [{'InstanceId': inst.get('InstanceId'), 'LifecycleState': inst.get('LifecycleState')} for inst in asg.get('Instances', [])]
            })
        return jsonify(asgs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Load Balancers (ELBv2 - Application/Network, and ELB - Classic) ---
@app.route('/api/load-balancers', methods=['GET'])
def list_load_balancers():
    try:
        lbs = []
        # Describe Application/Network Load Balancers (ELBv2)
        elbv2_response = elbv2_client.describe_load_balancers()
        for lb in elbv2_response['LoadBalancers']:
            lbs.append({
                'Name': lb.get('LoadBalancerName'),
                'Type': lb.get('Type').capitalize(),
                'DNSName': lb.get('DNSName'),
                'State': lb.get('State', {}).get('Code'),
                'VpcId': lb.get('VpcId'),
                'CreatedTime': lb.get('CreatedTime').isoformat() if lb.get('CreatedTime') else 'N/A',
                'Arn': lb.get('LoadBalancerArn')
            })

        # Describe Classic Load Balancers (ELB)
        elb_response = elb_client.describe_load_balancers()
        for lb in elb_response['LoadBalancerDescriptions']:
            lbs.append({
                'Name': lb.get('LoadBalancerName'),
                'Type': 'Classic',
                'DNSName': lb.get('DNSName'),
                'State': 'N/A',
                'VpcId': lb.get('VPCId'),
                'CreatedTime': lb.get('CreatedTime').isoformat() if lb.get('CreatedTime') else 'N/A',
                'Arn': 'N/A'
            })

        return jsonify(lbs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Snapshots ---
@app.route('/api/snapshots', methods=['GET'])
def list_snapshots():
    try:
        response = ec2_client.describe_snapshots(OwnerIds=['self'])
        snapshots = []
        for snapshot in response['Snapshots']:
            snapshot_name = 'N/A'
            for tag in snapshot.get('Tags', []):
                if tag['Key'] == 'Name':
                    snapshot_name = tag['Value']
                    break

            snapshots.append({
                'SnapshotId': snapshot.get('SnapshotId'),
                'VolumeId': snapshot.get('VolumeId'),
                'State': snapshot.get('State'),
                'StartTime': snapshot.get('StartTime').isoformat() if snapshot.get('StartTime') else 'N/A',
                'VolumeSize': snapshot.get('VolumeSize'),
                'Description': snapshot.get('Description'),
                'Name': snapshot_name
            })
        return jsonify(snapshots)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Volumes ---
@app.route('/api/volumes', methods=['GET'])
def list_volumes():
    try:
        response = ec2_client.describe_volumes()
        volumes = []
        for volume in response['Volumes']:
            volume_name = 'N/A'
            for tag in volume.get('Tags', []):
                if tag['Key'] == 'Name':
                    volume_name = tag['Value']
                    break

            volumes.append({
                'VolumeId': volume.get('VolumeId'),
                'Size': volume.get('Size'),
                'AvailabilityZone': volume.get('AvailabilityZone'),
                'State': volume.get('State'),
                'VolumeType': volume.get('VolumeType'),
                'CreateTime': volume.get('CreateTime').isoformat() if volume.get('CreateTime') else 'N/A',
                'SnapshotId': volume.get('SnapshotId', 'N/A'),
                'Name': volume_name,
                'Attachments': [{'InstanceId': att.get('InstanceId'), 'Device': att.get('Device')} for att in volume.get('Attachments', [])]
            })
        return jsonify(volumes)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Elastic IPs ---
@app.route('/api/elastic-ips', methods=['GET'])
def list_elastic_ips():
    try:
        response = ec2_client.describe_addresses()
        eips = []
        for eip in response['Addresses']:
            eips.append({
                'PublicIp': eip.get('PublicIp'),
                'AllocationId': eip.get('AllocationId'),
                'AssociationId': eip.get('AssociationId', 'N/A'),
                'InstanceId': eip.get('InstanceId', 'N/A'),
                'PrivateIpAddress': eip.get('PrivateIpAddress', 'N/A'),
                'Domain': eip.get('Domain'),
            })
        return jsonify(eips)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# --- Capacity Reservations ---
@app.route('/api/capacity-reservations', methods=['GET'])
def list_capacity_reservations():
    try:
        response = ec2_client.describe_capacity_reservations()
        crs = []
        for cr in response['CapacityReservations']:
            crs.append({
                'CapacityReservationId': cr.get('CapacityReservationId'),
                'InstanceType': cr.get('InstanceType'),
                'InstancePlatform': cr.get('InstancePlatform'),
                'AvailabilityZone': cr.get('AvailabilityZone'),
                'TotalInstanceCount': cr.get('TotalInstanceCount'),
                'AvailableInstanceCount': cr.get('AvailableInstanceCount'),
                'State': cr.get('State'),
                'CreateDate': cr.get('CreateDate').isoformat() if cr.get('CreateDate') else 'N/A',
                'EndDate': cr.get('EndDate').isoformat() if cr.get('EndDate') else 'N/A',
            })
        return jsonify(crs)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Dedicated Hosts ---
@app.route('/api/dedicated-hosts', methods=['GET'])
def list_dedicated_hosts():
    try:
        response = ec2_client.describe_hosts()
        hosts = []
        for host in response['Hosts']:
            hosts.append({
                'HostId': host.get('HostId'),
                'InstanceType': host.get('InstanceType'),
                'AvailabilityZone': host.get('AvailabilityZone'),
                'AllocationState': host.get('AllocationState'),
                'AvailableCapacity': host.get('AvailableCapacity'),
                'AllocationTime': host.get('AllocationTime').isoformat() if host.get('AllocationTime') else 'N/A',
            })
        return jsonify(hosts)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Placement Groups ---
@app.route('/api/placement-groups', methods=['GET'])
def list_placement_groups():
    try:
        response = ec2_client.describe_placement_groups()
        p_groups = []
        for pg in response['PlacementGroups']:
            p_groups.append({
                'GroupName': pg.get('GroupName'),
                'GroupId': pg.get('GroupId'),
                'Strategy': pg.get('Strategy'),
                'State': pg.get('State'),
                'InstanceCount': pg.get('InstanceCount'),
            })
        return jsonify(p_groups)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- EC2 Free Tier Usage Monitoring ---
@app.route('/api/ec2-free-tier-usage', methods=['GET'])
def get_ec2_free_tier_usage():
    try:
        today = datetime.now()
        start_date = today.replace(day=1).strftime('%Y-%m-%d')
        end_date = today.strftime('%Y-%m-%d')

        usage_types = [
            "BoxUsage:t2.micro", "BoxUsage:t3.micro", "BoxUsage:t2.micro:windows",
            "BoxUsage:t3.micro:windows", "BoxUsage:t2.micro:rhel", "BoxUsage:t3.micro:rhel",
            "BoxUsage:t2.micro:sles", "BoxUsage:t3.micro:sles",
        ]

        response = ce_client.get_cost_and_usage(
            TimePeriod={ 'Start': start_date, 'End': end_date },
            Granularity='DAILY',
            Metrics=['UsageQuantity'],
            Filter={"Or": [{"Dimensions": {"Key": "USAGE_TYPE", "Values": usage_types}},
                          {"Dimensions": {"Key": "INSTANCE_TYPE", "Values": ["t2.micro", "t3.micro"]}}]},
            GroupBy=[{"Type": "DIMENSION", "Key": "USAGE_TYPE"}]
        )

        daily_usage_data = {}
        total_current_month_usage = 0.0

        for result_by_time in response['ResultsByTime']:
            date = result_by_time['TimePeriod']['Start']
            daily_total_hours = 0.0
            for group in result_by_time['Groups']:
                usage_quantity = float(group['Metrics']['UsageQuantity']['Amount'])
                daily_total_hours += usage_quantity
                total_current_month_usage += usage_quantity
            daily_usage_data[date] = daily_total_hours

        chart_labels = []
        chart_data = []
        current_day = today.replace(day=1)
        while current_day <= today:
            date_str = current_day.strftime('%Y-%m-%d')
            chart_labels.append(current_day.strftime('%b %d'))
            chart_data.append(daily_usage_data.get(date_str, 0.0))
            current_day += timedelta(days=1)

        free_tier_limit_hours = 750

        return jsonify({
            "labels": chart_labels,
            "data": chart_data,
            "totalCurrentMonthUsage": round(total_current_month_usage, 2),
            "freeTierLimitHours": free_tier_limit_hours,
            "remainingHours": round(free_tier_limit_hours - total_current_month_usage, 2)
        })

    except Exception as e:
        print(f"Error fetching EC2 Free Tier usage: {e}")
        return jsonify({"error": str(e)}), 500

# --- AWS Cost Explorer General Cost Data ---
@app.route('/api/aws-cost-explorer', methods=['GET'])
def get_aws_cost_explorer_data():
    try:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

        if request.args:
            params = request.args
            if 'startDate' in params:
                start_date = params['startDate']
            if 'endDate' in params:
                end_date = params['endDate']

        response = ce_client.get_cost_and_usage(
            TimePeriod={ 'Start': start_date, 'End': end_date },
            Granularity='MONTHLY',
            Metrics=['UnblendedCost'],
            GroupBy=[{'Type': 'DIMENSION', 'Key': 'SERVICE'}]
        )

        results = []
        for result_by_time in response['ResultsByTime']:
            time_period_start = result_by_time['TimePeriod']['Start']
            for group in result_by_time['Groups']:
                service_name = group['Keys'][0] if group['Keys'] else 'No Service'
                amount = float(group['Metrics']['UnblendedCost']['Amount'])
                unit = group['Metrics']['UnblendedCost']['Unit']
                results.append({
                    'TimePeriod': time_period_start,
                    'Service': service_name,
                    'Amount': amount,
                    'Unit': unit
                })

        return jsonify(results)

    except Exception as e:
        print(f"Error fetching AWS Cost Explorer data: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
