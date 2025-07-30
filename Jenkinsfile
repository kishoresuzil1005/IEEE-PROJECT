pipeline {
    agent any

    environment {
        // Use the IDs of the credentials you created in Jenkins
        AWS_ACCESS_KEY_ID = credentials('your-aws-access-key-id-credential-id')
        AWS_SECRET_ACCESS_KEY = credentials('your-aws-secret-access-key-credential-id')
        DOCKER_HUB_CREDENTIALS = credentials('your-docker-hub-credential-id')
        SERVER_SSH_CREDENTIALS = credentials('your-ssh-credential-id')
        DOCKER_IMAGE_NAME = "kishore/aws-dashboard:latest" // Replace with your Docker Hub repo name
    }

    stages {
        stage('Build Docker Image') {
            steps {
                sh 'docker build -t ${DOCKER_IMAGE_NAME} .'
            }
        }
        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(credentialsId: "${DOCKER_HUB_CREDENTIALS}", usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
                    sh 'echo ${DOCKER_PASSWORD} | docker login -u ${DOCKER_USERNAME} --password-stdin'
                    sh 'docker push ${DOCKER_IMAGE_NAME}'
                }
            }
        }
        stage('Deploy to Server') {
            steps {
                // Adjust this step based on whether you are deploying locally or to a remote server
                script {
                    if (isUnix()) {
                        // Remote Deployment via SSH
                        sshagent(['your-ssh-credential-id']) {
                            sh "ssh -o StrictHostKeyChecking=no YOUR_SERVER_USER@YOUR_SERVER_IP 'docker pull ${DOCKER_IMAGE_NAME} && docker stop aws-dashboard-app || true && docker rm aws-dashboard-app || true && docker run -d -p 5000:5000 -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} -e AWS_REGION=us-east-1 --name aws-dashboard-app ${DOCKER_IMAGE_NAME}'"
                        }
                    } else {
                        // Local Deployment
                        sh "docker stop aws-dashboard-app || true && docker rm aws-dashboard-app || true && docker run -d -p 5000:5000 -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} -e AWS_REGION=us-east-1 --name aws-dashboard-app ${DOCKER_IMAGE_NAME}"
                    }
                }
            }
        }
    }
}
