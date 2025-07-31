pipeline {
    agent any

    environment {
        // Use the IDs of the credentials you created in Jenkins
        AWS_ACCESS_KEY_ID = credentials('aws-access-key-id')
        AWS_SECRET_ACCESS_KEY = credentials('aws-secret-access-key')
        DOCKER_HUB_CREDENTIALS = credentials('docker-hub-credentials')
        DOCKER_IMAGE_NAME = "kishoresuzil/aws-dashboard:latest"
    }

    stages {
        stage('Build Docker Image') {
            steps {
                sh 'docker build -t ${DOCKER_IMAGE_NAME} .'
            }
        }
        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'docker-hub-credentials', usernameVariable: 'DOCKER_USERNAME', passwordVariable: 'DOCKER_PASSWORD')]) {
                    sh 'echo ${DOCKER_PASSWORD} | docker login -u ${DOCKER_USERNAME} --password-stdin'
                    sh 'docker push ${DOCKER_IMAGE_NAME}'
                }
            }
        }
        stage('Deploy to Local Machine') {
            steps {
                sh "docker stop aws-dashboard-app || true"
                sh "docker rm aws-dashboard-app || true"
                sh "docker run -d -p 5000:5000 -e AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID} -e AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} -e AWS_REGION=us-east-1 --name aws-dashboard-app ${DOCKER_IMAGE_NAME}"
            }
        }
    }
}
