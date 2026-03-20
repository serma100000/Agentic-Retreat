/**
 * Helm chart generator for federated OpenPulse deployments.
 *
 * Produces a complete Helm chart structure as a structured object,
 * configurable for instance name, resource limits, federation peers,
 * and data sharing level.
 */

import type { DataSharingLevelType } from './types.js';

export interface HelmChartConfig {
  instanceName: string;
  namespace: string;
  imageRepository: string;
  imageTag: string;
  replicas: number;
  cpuLimit: string;
  memoryLimit: string;
  cpuRequest: string;
  memoryRequest: string;
  federationPeers: string[];
  dataSharing: DataSharingLevelType;
  networkUrl: string;
  syncIntervalSeconds: number;
  ingressHost: string;
  ingressEnabled: boolean;
  hpaMinReplicas: number;
  hpaMaxReplicas: number;
  hpaTargetCpuPercent: number;
  servicePort: number;
  containerPort: number;
}

export interface HelmChartFile {
  path: string;
  content: string;
}

export interface HelmChartOutput {
  chartName: string;
  files: HelmChartFile[];
}

const DEFAULT_CONFIG: HelmChartConfig = {
  instanceName: 'openpulse',
  namespace: 'openpulse',
  imageRepository: 'openpulse/openpulse',
  imageTag: 'latest',
  replicas: 2,
  cpuLimit: '1000m',
  memoryLimit: '512Mi',
  cpuRequest: '250m',
  memoryRequest: '256Mi',
  federationPeers: [],
  dataSharing: 'aggregate',
  networkUrl: 'https://federation.openpulse.io',
  syncIntervalSeconds: 60,
  ingressHost: 'openpulse.example.com',
  ingressEnabled: true,
  hpaMinReplicas: 2,
  hpaMaxReplicas: 10,
  hpaTargetCpuPercent: 70,
  servicePort: 80,
  containerPort: 3000,
};

export class HelmChartGenerator {
  /**
   * Generate a complete Helm chart structure for a federated OpenPulse instance.
   */
  generateChart(config: Partial<HelmChartConfig> = {}): HelmChartOutput {
    const c = { ...DEFAULT_CONFIG, ...config };
    const chartName = c.instanceName;

    return {
      chartName,
      files: [
        { path: 'Chart.yaml', content: this.generateChartYaml(c) },
        { path: 'values.yaml', content: this.generateValuesYaml(c) },
        { path: 'templates/deployment.yaml', content: this.generateDeployment(c) },
        { path: 'templates/service.yaml', content: this.generateService(c) },
        { path: 'templates/configmap.yaml', content: this.generateConfigMap(c) },
        { path: 'templates/secret.yaml', content: this.generateSecret(c) },
        { path: 'templates/ingress.yaml', content: this.generateIngress(c) },
        { path: 'templates/hpa.yaml', content: this.generateHPA(c) },
      ],
    };
  }

  private generateChartYaml(c: HelmChartConfig): string {
    return `apiVersion: v2
name: ${c.instanceName}
description: OpenPulse federated instance - ${c.instanceName}
type: application
version: 0.1.0
appVersion: "1.0.0"
keywords:
  - openpulse
  - monitoring
  - federation
  - outage-detection
maintainers:
  - name: OpenPulse Team
`;
  }

  private generateValuesYaml(c: HelmChartConfig): string {
    const peersYaml = c.federationPeers.length > 0
      ? c.federationPeers.map((p) => `  - "${p}"`).join('\n')
      : '  []';

    return `replicaCount: ${c.replicas}

image:
  repository: ${c.imageRepository}
  tag: "${c.imageTag}"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: ${c.servicePort}

containerPort: ${c.containerPort}

resources:
  limits:
    cpu: ${c.cpuLimit}
    memory: ${c.memoryLimit}
  requests:
    cpu: ${c.cpuRequest}
    memory: ${c.memoryRequest}

ingress:
  enabled: ${c.ingressEnabled}
  host: ${c.ingressHost}
  annotations:
    kubernetes.io/ingress.class: nginx

autoscaling:
  enabled: true
  minReplicas: ${c.hpaMinReplicas}
  maxReplicas: ${c.hpaMaxReplicas}
  targetCPUUtilizationPercentage: ${c.hpaTargetCpuPercent}

federation:
  networkUrl: "${c.networkUrl}"
  dataSharing: "${c.dataSharing}"
  syncIntervalSeconds: ${c.syncIntervalSeconds}
  peers:
${peersYaml}
`;
  }

  private generateDeployment(c: HelmChartConfig): string {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-${c.instanceName}
  namespace: {{ .Release.Namespace }}
  labels:
    app: ${c.instanceName}
    chart: {{ .Chart.Name }}-{{ .Chart.Version }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: ${c.instanceName}
  template:
    metadata:
      labels:
        app: ${c.instanceName}
    spec:
      containers:
        - name: ${c.instanceName}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - containerPort: {{ .Values.containerPort }}
              protocol: TCP
          env:
            - name: FEDERATION_NETWORK_URL
              valueFrom:
                configMapKeyRef:
                  name: {{ .Release.Name }}-federation-config
                  key: networkUrl
            - name: FEDERATION_DATA_SHARING
              valueFrom:
                configMapKeyRef:
                  name: {{ .Release.Name }}-federation-config
                  key: dataSharing
            - name: FEDERATION_SYNC_INTERVAL
              valueFrom:
                configMapKeyRef:
                  name: {{ .Release.Name }}-federation-config
                  key: syncIntervalSeconds
            - name: FEDERATION_PRIVATE_KEY
              valueFrom:
                secretKeyRef:
                  name: {{ .Release.Name }}-federation-secret
                  key: privateKey
          resources:
            limits:
              cpu: {{ .Values.resources.limits.cpu }}
              memory: {{ .Values.resources.limits.memory }}
            requests:
              cpu: {{ .Values.resources.requests.cpu }}
              memory: {{ .Values.resources.requests.memory }}
          livenessProbe:
            httpGet:
              path: /healthz
              port: {{ .Values.containerPort }}
            initialDelaySeconds: 15
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /readyz
              port: {{ .Values.containerPort }}
            initialDelaySeconds: 5
            periodSeconds: 5
`;
  }

  private generateService(c: HelmChartConfig): string {
    return `apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-${c.instanceName}
  namespace: {{ .Release.Namespace }}
  labels:
    app: ${c.instanceName}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: {{ .Values.containerPort }}
      protocol: TCP
      name: http
  selector:
    app: ${c.instanceName}
`;
  }

  private generateConfigMap(c: HelmChartConfig): string {
    return `apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ .Release.Name }}-federation-config
  namespace: {{ .Release.Namespace }}
  labels:
    app: ${c.instanceName}
data:
  networkUrl: {{ .Values.federation.networkUrl | quote }}
  dataSharing: {{ .Values.federation.dataSharing | quote }}
  syncIntervalSeconds: {{ .Values.federation.syncIntervalSeconds | quote }}
  peers: {{ .Values.federation.peers | toJson | quote }}
`;
  }

  private generateSecret(_c: HelmChartConfig): string {
    return `apiVersion: v1
kind: Secret
metadata:
  name: {{ .Release.Name }}-federation-secret
  namespace: {{ .Release.Namespace }}
type: Opaque
data:
  privateKey: {{ required "federation.privateKey is required" .Values.federation.privateKey | b64enc | quote }}
  publicKey: {{ required "federation.publicKey is required" .Values.federation.publicKey | b64enc | quote }}
`;
  }

  private generateIngress(c: HelmChartConfig): string {
    return `{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}-${c.instanceName}
  namespace: {{ .Release.Namespace }}
  labels:
    app: ${c.instanceName}
  {{- with .Values.ingress.annotations }}
  annotations:
    {{- toYaml . | nindent 4 }}
  {{- end }}
spec:
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}-${c.instanceName}
                port:
                  number: {{ .Values.service.port }}
  tls:
    - hosts:
        - {{ .Values.ingress.host }}
      secretName: {{ .Release.Name }}-tls
{{- end }}
`;
  }

  private generateHPA(c: HelmChartConfig): string {
    return `{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ .Release.Name }}-${c.instanceName}
  namespace: {{ .Release.Namespace }}
  labels:
    app: ${c.instanceName}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ .Release.Name }}-${c.instanceName}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
`;
  }
}
