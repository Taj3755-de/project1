pipeline {
    agent any

    environment {
        // App settings
        APP_NAME        = "bluegreen-app"

        // AWS ECR
        AWS_REGION      = "us-east-1"
        ACCOUNT_ID      = "157314643992"
        REPO            = "finacplus/app-01v"
        IMAGE_URI       = "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"

        // SSH to Kubernetes master
        K8S_MASTER      = "rocky@172.31.86.230"
        SSH_CRED        = "kube-master-ssh"

        // Helm settings
        HELM_RELEASE    = "finacplus"
        HELM_CHART_PATH = "/home/rocky/helm/bluegreen"
        NAMESPACE       = "default"

        // Health check endpoint
        HEALTH_URL      = "/actuator/health"
    }

    stages {

        /***************************
         * 1. CHECKOUT CODE
         ***************************/
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        /***************************
         * 2. BUILD & PUSH IMAGE
         ***************************/
        stage('Build & Push Docker Image') {
            steps {
                sh """
                    aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

                    docker build -t ${IMAGE_URI}:${BUILD_NUMBER} ./app
                    docker push ${IMAGE_URI}:${BUILD_NUMBER}
                """
            }
        }

        /***************************
         * 3. UPLOAD HELM CHART TO K8s NODE
         ***************************/
        stage('Upload Helm Chart to Kubernetes Node') {
            steps {
                sshagent([SSH_CRED]) {

                    sh """
                        # Create folder on remote node
                        ssh -o StrictHostKeyChecking=no ${K8S_MASTER} "mkdir -p ${HELM_CHART_PATH}"

                        # Copy helm chart to remote node
                        scp -o StrictHostKeyChecking=no -r helm/bluegreen-app/* ${K8S_MASTER}:${HELM_CHART_PATH}/

                        # List to verify
                        ssh ${K8S_MASTER} "ls -l ${HELM_CHART_PATH}"
                    """
                }
            }
        }

        /***************************
         * 4. DETECT ACTIVE COLOR
         ***************************/
        stage('Detect Live Color') {
            steps {
                sshagent([SSH_CRED]) {
                    script {
                        def activeColor = sh(
                            script: """
                                ssh -o StrictHostKeyChecking=no ${K8S_MASTER} \\
                                "kubectl get svc ${HELM_RELEASE} -n ${NAMESPACE} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo ''"
                            """,
                            returnStdout: true
                        ).trim()

                        if (activeColor == "blue") {
                            env.TARGET = "green"
                        } else if (activeColor == "green") {
                            env.TARGET = "blue"
                        } else {
                            echo "Service not found — FIRST DEPLOY — using BLUE."
                            env.TARGET = "blue"
                        }

                        echo "Active color = ${activeColor}, deploying to = ${env.TARGET}"
                    }
                }
            }
        }

        /***************************
         * 5. DEPLOY USING HELM
         ***************************/
        stage('Deploy New Color using Helm') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                        ssh ${K8S_MASTER} "
                            helm upgrade --install ${HELM_RELEASE}-${env.TARGET} ${HELM_CHART_PATH} \
                                --namespace ${NAMESPACE} \
                                -f ${HELM_CHART_PATH}/values-${env.TARGET}.yaml \
                                --set image.tag=${BUILD_NUMBER} \
                                --set image.repository=${IMAGE_URI}
                        "
                    """
                }
            }
        }

        /***************************
         * 6. HEALTH CHECK
         ***************************/
        stage('Health Check') {
            steps {
                sshagent([SSH_CRED]) {
                    script {

                        def pod = sh(
                            script: """
                                ssh ${K8S_MASTER} \\
                                "kubectl get pods -n ${NAMESPACE} -l app=${APP_NAME},color=${env.TARGET} -o jsonpath='{.items[0].metadata.name}'"
                            """,
                            returnStdout: true
                        ).trim()

                        sh """
                            ssh ${K8S_MASTER} "
                                for i in {1..10}; do
                                    STATUS=\\\$(kubectl exec -n ${NAMESPACE} ${pod} -- curl -s http://localhost:8080${HEALTH_URL} | jq -r .status)
                                    if [ \\\\"\\\$STATUS\\\\" = \\\\"UP\\\\" ]; then
                                        echo 'Health OK'
                                        exit 0
                                    fi
                                    echo 'Retrying health check...'
                                    sleep 5
                                done
                                echo 'Health FAILED'
                                exit 1
                            "
                        """
                    }
                }
            }
        }

        /***************************
         * 7. SWITCH TRAFFIC
         ***************************/
        stage('Switch Service to New Color') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                        ssh ${K8S_MASTER} "
                            kubectl patch svc ${HELM_RELEASE} -n ${NAMESPACE} \
                                -p '{\"spec\":{\"selector\":{\"app\":\"${APP_NAME}\",\"color\":\"${env.TARGET}\"}}}'
                        "
                    """
                }
            }
        }
    }

    /***************************
     * 8. ROLLBACK ON FAILURE
     ***************************/
    post {
        failure {
            sshagent([SSH_CRED]) {
                script {
                    echo "❌ Deployment failed — performing rollback"
                    def rollbackColor = env.TARGET == "blue" ? "green" : "blue"

                    sh """
                        ssh ${K8S_MASTER} "
                            kubectl patch svc ${HELM_RELEASE} -n ${NAMESPACE} \
                                -p '{\"spec\":{\"selector\":{\"app\":\"${APP_NAME}\",\"color\":\"${rollbackColor}\"}}}'
                        "
                    """
                }
            }
        }
    }
}
