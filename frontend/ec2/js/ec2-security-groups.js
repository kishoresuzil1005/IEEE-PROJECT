// frontend/ec2/js/ec2-security-groups.js

document.addEventListener('DOMContentLoaded', () => {
    const API_BASE_URL = 'http://127.0.0.1:5000/api'; // Make sure this matches your Flask backend URL
    const tableBody = document.querySelector('#securityGroupsTable tbody');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessageDiv = document.getElementById('errorMessage');
    const refreshButton = document.getElementById('refreshButton');
    const createSgButton = document.getElementById('createSgButton'); // Get the new button

    async function fetchSecurityGroups() {
        loadingMessage.style.display = 'block';
        errorMessageDiv.style.display = 'none';
        tableBody.innerHTML = ''; // Clear existing rows

        try {
            // Using the callApi helper from common.js
            const sgs = await callApi(`${API_BASE_URL}/security-groups`);
            displaySecurityGroups(sgs);
        } catch (error) {
            console.error('Error fetching Security Groups:', error);
            errorMessageDiv.textContent = `Failed to load Security Groups: ${error.message}. Please ensure the backend is running and AWS credentials are set.`;
            errorMessageDiv.style.display = 'block';
        } finally {
            loadingMessage.style.display = 'none';
        }
    }

    function displaySecurityGroups(sgs) {
        if (sgs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7">No Security Groups found in this region.</td></tr>'; // colspan updated to 7
            return;
        }

        sgs.forEach(sg => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = sg.GroupName || 'N/A';
            row.insertCell().textContent = sg.GroupId || 'N/A';
            row.insertCell().textContent = sg.Description || 'N/A';
            row.insertCell().textContent = sg.VpcId || 'N/A';

            // --- Inbound Rules (IpPermissions) ---
            const inboundRulesCell = row.insertCell();
            if (sg.IpPermissions && sg.IpPermissions.length > 0) {
                sg.IpPermissions.forEach(perm => {
                    const fromPort = perm.FromPort !== undefined ? perm.FromPort : 'All';
                    const toPort = perm.ToPort !== undefined ? perm.ToPort : fromPort;
                    const protocol = perm.IpProtocol || 'All';
                    const ipRanges = perm.IpRanges.map(range => range.CidrIp).join(', ') || 'N/A';
                    const userIdGroupPairs = perm.UserIdGroupPairs.map(pair => `${pair.GroupId || pair.GroupName}`).join(', ') || '';

                    let ruleDescription = `${protocol}:${fromPort}`;
                    if (fromPort !== toPort && toPort !== 'All') {
                        ruleDescription += `-${toPort}`;
                    } else if (fromPort === 'All' && toPort === 'All') {
                         ruleDescription = `${protocol}:All`;
                    }

                    ruleDescription += ` from ${ipRanges}`;
                    if (userIdGroupPairs) {
                        ruleDescription += ` (${userIdGroupPairs})`;
                    }
                    inboundRulesCell.innerHTML += `<div>${ruleDescription}</div>`;
                });
            } else {
                inboundRulesCell.textContent = 'None';
            }

            // --- Outbound Rules (IpPermissionsEgress) ---
            const outboundRulesCell = row.insertCell();
            if (sg.IpPermissionsEgress && sg.IpPermissionsEgress.length > 0) {
                sg.IpPermissionsEgress.forEach(perm => {
                    const fromPort = perm.FromPort !== undefined ? perm.FromPort : 'All';
                    const toPort = perm.ToPort !== undefined ? perm.ToPort : fromPort;
                    const protocol = perm.IpProtocol || 'All';
                    const ipRanges = perm.IpRanges.map(range => range.CidrIp).join(', ') || 'N/A';
                    const userIdGroupPairs = perm.UserIdGroupPairs.map(pair => `${pair.GroupId || pair.GroupName}`).join(', ') || '';

                    let ruleDescription = `${protocol}:${fromPort}`;
                    if (fromPort !== toPort && toPort !== 'All') {
                        ruleDescription += `-${toPort}`;
                    } else if (fromPort === 'All' && toPort === 'All') {
                        ruleDescription = `${protocol}:All`;
                    }

                    ruleDescription += ` to ${ipRanges}`;
                    if (userIdGroupPairs) {
                        ruleDescription += ` (${userIdGroupPairs})`;
                    }
                    outboundRulesCell.innerHTML += `<div>${ruleDescription}</div>`;
                });
            } else {
                outboundRulesCell.textContent = 'All Traffic'; // Default for outbound rules if not specified
            }

            // Actions Cell (for delete button)
            const actionsCell = row.insertCell();
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'action-button delete-button'; // Added delete-button class for potential specific styling
            deleteButton.onclick = () => handleDeleteSecurityGroup(sg.GroupId, sg.GroupName);
            actionsCell.appendChild(deleteButton);
        });
    }

    async function handleCreateSecurityGroup() {
        const groupName = prompt("Enter a name for the new Security Group:");
        if (!groupName) return; // User cancelled or entered empty

        const description = prompt("Enter a description for the new Security Group (optional):", "");
        const vpcId = prompt("Enter the VPC ID (e.g., vpc-xxxxxxxxxxxx) for the new Security Group (required):");
        if (!vpcId) {
            alert("VPC ID is required to create a Security Group.");
            return;
        }

        try {
            const response = await callApi(`${API_BASE_URL}/security-group/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ group_name: groupName, description: description, vpc_id: vpcId })
            });
            alert(response.message);
            fetchSecurityGroups(); // Refresh the list after creation
        } catch (error) {
            console.error('Error creating Security Group:', error);
            alert(`Error creating Security Group: ${error.message}`);
        }
    }


    // Initial fetch when the page loads
    fetchSecurityGroups();

    // Add event listener for the refresh button
    refreshButton.addEventListener('click', fetchSecurityGroups);

    // Add event listener for the create security group button
    createSgButton.addEventListener('click', handleCreateSecurityGroup);
});

