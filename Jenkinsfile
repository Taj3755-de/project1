pipeline {
    agent any

    environment {
        APP_NAME        = "bluegreen-app"
        IMAGE_REPO      = "157314643992.dkr.ecr.us-east-1.amazonaws.com/finacplus/app-01v"
        AWS_REGION      = "us-east-1"
        CHART_PATH      = "helm/bluegreen-app"
        RELEASE_NAME    = "finacplus"
        NAMESPACE       = "default"
        HEALTH_URL      = "/actuator/health"
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Push Docker Image') {
            steps {
                sh """
                    aws ecr get-login-password --region ${AWS_REGION} \
                      | docker login --username AWS --password-stdin ${IMAGE_REPO}

                    docker build -t ${IMAGE_REPO}:${BUILD_NUMBER} ./app
                    docker push ${IMAGE_REPO}:${BUILD_NUMBER}
                """
            }
        }

        stage('Determine Active Color') {
            steps {
                script {
                    def active = sh(
                        script: "kubectl get svc ${RELEASE_NAME} -o jsonpath='{.spec.selector.color}'",
                        returnStdout: true
                    ).trim()

                    env.TARGET = active == "blue" ? "green" : "blue"
                    echo "ACTIVE: ${active}, TARGET: ${env.TARGET}"
                }
            }
        }

        stage('Deploy New Color using Helm') {
            steps {
                script {
                    sh """
                        helm upgrade --install ${RELEASE_NAME}-${env.TARGET} ${CHART_PATH} \
                            --namespace ${NAMESPACE} \
                            -f ${CHART_PATH}/values-${env.TARGET}.yaml \
                            --set image.tag=${BUILD_NUMBER}
                    """
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def pod = sh(
                        script: "kubectl get pods -l app=${APP_NAME},color=${env.TARGET} -o jsonpath='{.items[0].metadata.name}'",
                        returnStdout: true
                    ).trim()

                    sh """
                        for i in {1..10}; do
                            STATUS=\$(kubectl exec ${pod} -- curl -s http://localhost:8080${HEALTH_URL} | jq -r .status)
                            if [ "\$STATUS" == "UP" ]; then
                                echo "Health OK"
                                exit 0
                            fi
                            sleep 5
                        done
                        exit 1
                    """
                }
            }
        }

        stage('Switch Service to New Color') {
            steps {
                sh """
                    kubectl patch svc ${RELEASE_NAME} \
                      -p '{"spec":{"selector":{"app":"${APP_NAME}","color":"${env.TARGET}"}}}'
                """
            }
        }
    }

    post {
        failure {
            script {
                echo "Deployment failed, Rolling Back..."

                def rollbackColor = env.TARGET == "blue" ? "green" : "blue"

                sh """
                    kubectl patch svc ${RELEASE_NAME} \
                      -p '{"spec":{"selector":{"app":"${APP_NAME}","color":"${rollbackColor}"}}}'
                """
            }
        }
    }
}
