pipeline {
    agent any

    environment {
        // Application
        APP_NAME        = "bluegreen-app"

        // AWS ECR
        AWS_REGION      = "us-east-1"
        ACCOUNT_ID      = "157314643992"
        REPO            = "finacplus/app-01v"
        IMAGE_URI       = "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO}"

        // Kubernetes SSH
        K8S_MASTER      = "rocky@172.31.86.230"
        SSH_CRED        = "kube-master-ssh"

        // Helm
        HELM_RELEASE    = "finacplus"
        HELM_CHART_PATH = "/home/rocky/helm/bluegreen"
        NAMESPACE       = "default"

        // Health Endpoint
        HEALTH_URL      = "/actuator/health"
    }

    stages {

        /***************************
         * 1. CHECKOUT
         ***************************/
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        /***************************
         * 2. BUILD AND PUSH IMAGE
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
         * 3. UPLOAD HELM CHART
         ***************************/
        stage('Upload Helm Chart') {
            steps {
                sshagent([SSH_CRED]) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${K8S_MASTER} "mkdir -p ${HELM_CHART_PATH}"
                        scp -o StrictHostKeyChecking=no -r helm/bluegreen-app/* ${K8S_MASTER}:${HELM_CHART_PATH}/
                        ssh ${K8S_MASTER} "ls -l ${HELM_CHART_PATH}"
                    """
                }
            }
        }

        /***************************
         * 4. DETECT COLOR
         ***************************/
        stage('Detect Live Color') {
            steps {
                sshagent([SSH_CRED]) {
                    script {
                        def activeColor = sh(
                            script: """
                                ssh ${K8S_MASTER} "kubectl get svc ${HELM_RELEASE} -n ${NAMESPACE} -o jsonpath='{.spec.selector.color}' 2>/dev/null || echo ''"
                            """,
                            returnStdout: true
                        ).trim()

                        if (activeColor == "blue") {
                            env.TARGET = "green"
                        } else if (activeColor == "green") {
                            env.TARGET = "blue"
                        } else {
                            env.TARGET = "blue"
                        }

                        echo "Active Color: ${activeColor}, Deploying: ${env.TARGET}"
                    }
                }
            }
        }

        /***************************
         * 5. DEPLOY WITH HELM
         ***************************/
stage('Deploy New Color using Helm') {
    steps {
        sshagent([SSH_CRED]) {
            script {
                def releaseName = "${HELM_RELEASE}-${env.TARGET}"

                sh """
                    ssh ${K8S_MASTER} "
                        helm upgrade --install ${releaseName} ${HELM_CHART_PATH} \
                            --namespace ${NAMESPACE} \
                            -f ${HELM_CHART_PATH}/values-${env.TARGET}.yaml \
                            --set color=${env.TARGET} \
                            --set image.tag=${BUILD_NUMBER} \
                            --set image.repository=${IMAGE_URI}
                    "
                """
            }
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

                // Get pod name dynamically
                def pod = sh(
                    script: """
                        ssh ${K8S_MASTER} "kubectl get pods -n ${NAMESPACE} -l app=${APP_NAME},color=${env.TARGET} -o jsonpath='{.items[0].metadata.name}'"
                    """,
                    returnStdout: true
                ).trim()

                echo "Checking health for pod: ${pod}"

                // Build SSH script (no Groovy escaping issues)
                def healthCmd = """
                    kubectl wait --for=condition=Ready pod/${pod} -n ${NAMESPACE} --timeout=60s || exit 1;

                    CONTAINER="bluegreen-app";
                    echo Using container: \$CONTAINER;

                    for i in {1..10}; do
                        RAW=\$(kubectl exec -n ${NAMESPACE} ${pod} -c \$CONTAINER -- curl -s http://localhost:8080${HEALTH_URL});
                        echo "Response: \$RAW";

                        STATUS=\$(echo \$RAW | grep -o "UP" || true);

                        if [ "\$STATUS" = "DOWN" ]; then
                            echo "Health OK";
                            exit 0;
                        fi;

                        echo "Retrying health check...";
                        sleep 5;
                    done;

                    echo "Health FAILED";
                    exit 1;
                """

                    sh """
                    ssh ${K8S_MASTER} '${healthCmd}'
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
                ssh ${K8S_MASTER} '
                    kubectl patch svc ${HELM_RELEASE} -n ${NAMESPACE} \
                    -p "{\\"spec\\":{\\"selector\\":{\\"app\\":\\"${APP_NAME}\\",\\"color\\":\\"${env.TARGET}\\"}}}"
                '
            """
        }
    }
}
    }

    /***************************
     * 8. ROLLBACK
     ***************************/
   post {
    failure {
        sshagent([SSH_CRED]) {
            script {
                def rollbackColor = env.TARGET == "blue" ? "green" : "blue"

                sh """
                    ssh -o StrictHostKeyChecking=no ${K8S_MASTER} \\
                    "kubectl patch svc ${HELM_RELEASE} -n ${NAMESPACE} -p '{\\\\\"spec\\\\\":{\\\\\"selector\\\\\":{\\\\\"app\\\\\":\\\\\"${APP_NAME}\\\\\",\\\\\"color\\\\\":\\\\\"${rollbackColor}\\\\\"}}}'"
                """
            }
        }
    }
}
}
