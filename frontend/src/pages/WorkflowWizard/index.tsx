import React, { useEffect, useState } from 'react';
import { Card, Steps, Button, Typography, Alert, Space, Tag } from 'antd';
import { RocketOutlined, ReloadOutlined, ArrowLeftOutlined, EyeOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkflowStore, useEpisodeWorkflowStore } from '../../stores';
import Step1Analysis from './Step1Analysis';
import Step2Assets from './Step2Assets';
import Step3Storyboards from './Step3Storyboards';
import Step4Keyframes from './Step4Keyframes';
import Step5Video from './Step5Video';

const { Title } = Typography;

const STATE_TO_STEP: Record<string, number> = {
  idle: 0,
  analyzing: 0,
  reviewing: 0,
  generating_assets: 1,
  assets_ready: 1,
  generating_storyboards: 2,
  storyboards_ready: 2,
  generating_keyframes: 3,
  completed: 3,
  generating_video: 4,
  video_ready: 5,
  failed: -1,
};

const STATE_LABELS: Record<string, { label: string; color: string }> = {
  idle: { label: '待开始', color: 'default' },
  analyzing: { label: '分析中...', color: 'processing' },
  reviewing: { label: '审核中', color: 'warning' },
  generating_assets: { label: '生成素材中...', color: 'processing' },
  assets_ready: { label: '素材就绪', color: 'success' },
  generating_storyboards: { label: '生成分镜中...', color: 'processing' },
  storyboards_ready: { label: '分镜就绪', color: 'success' },
  generating_keyframes: { label: '生成首尾帧中...', color: 'processing' },
  completed: { label: '首尾帧就绪', color: 'success' },
  generating_video: { label: '生成视频中...', color: 'processing' },
  video_ready: { label: '视频就绪', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

const WorkflowWizard: React.FC = () => {
  const navigate = useNavigate();
  const { id, episodeId: episodeIdParam } = useParams<{ id: string; episodeId?: string }>();
  const projectId = Number(id);
  const episodeId = episodeIdParam ? Number(episodeIdParam) : undefined;
  const isEpisodeMode = !!episodeId;

  const projectWorkflow = useWorkflowStore();
  const episodeWorkflow = useEpisodeWorkflowStore();

  // Pick the right store based on mode
  const status = isEpisodeMode ? episodeWorkflow.status : projectWorkflow.status;
  const loading = isEpisodeMode ? episodeWorkflow.loading : projectWorkflow.loading;
  const error = isEpisodeMode ? episodeWorkflow.error : projectWorkflow.error;
  const fetchStatus = isEpisodeMode ? episodeWorkflow.fetchStatus : projectWorkflow.fetchStatus;
  const stopPolling = isEpisodeMode ? episodeWorkflow.stopPolling : projectWorkflow.stopPolling;
  const resetWorkflow = isEpisodeMode ? episodeWorkflow.resetWorkflow : projectWorkflow.resetWorkflow;
  const retryFailed = isEpisodeMode ? episodeWorkflow.retryFailed : projectWorkflow.retryFailed;
  const runAll = isEpisodeMode ? null : projectWorkflow.runAll; // No runAll for episodes

  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  useEffect(() => {
    if (isEpisodeMode) {
      fetchStatus(episodeId!);
    } else {
      fetchStatus(projectId);
    }
    return () => stopPolling();
  }, [projectId, episodeId]);

  const state = status?.state || 'idle';
  const currentStep = state === 'failed' ? 0 : (STATE_TO_STEP[state] ?? 0);
  const stateLabel = STATE_LABELS[state] || STATE_LABELS.idle;

  // 当前查看的步骤：null 表示查看当前步骤
  const viewingStep = selectedStep !== null ? selectedStep : currentStep;

  // 点击步骤条
  const handleStepClick = (step: number) => {
    // Allow clicking failed or current/past steps
    if (state === 'failed' || step <= currentStep) {
      setSelectedStep(step);
    }
  };

  // 返回当前步骤
  const goToCurrentStep = () => setSelectedStep(null);

  // 判断是否在查看已完成的步骤
  const isViewingPast = selectedStep !== null && selectedStep < currentStep;

  const showStep1 = viewingStep === 0;
  const showStep2 = viewingStep === 1 && (isViewingPast || state === 'failed' || !['idle', 'analyzing'].includes(state));
  const showStep3 = viewingStep === 2 && (isViewingPast || state === 'failed' || ['generating_storyboards', 'storyboards_ready', 'generating_keyframes', 'completed', 'generating_video', 'video_ready'].includes(state));
  const showStep4 = viewingStep === 3 && (isViewingPast || !['generating_video', 'video_ready'].includes(state));
  const showStep5 = viewingStep === 4 || viewingStep === 5 || (viewingStep === 3 && ['generating_keyframes', 'completed', 'generating_video', 'video_ready'].includes(state) && !isViewingPast);

  const backPath = `/projects/${id}`;
  const entityId = isEpisodeMode ? episodeId! : projectId;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(backPath)}>返回项目</Button>
          <Title level={2} style={{ margin: 0 }}>
            {isEpisodeMode ? `剧集工作流` : 'AI 工作流'}
          </Title>
          <Tag color={stateLabel.color}>{stateLabel.label}</Tag>
        </Space>
        <Space>
          {((status?.tasks && status.tasks.failed > 0) || state === 'failed') && (
            <Button type={state === 'failed' ? 'primary' : 'default'} icon={<ReloadOutlined />} onClick={() => { retryFailed(entityId); setSelectedStep(null); }}>
              {state === 'failed' ? '重试失败步骤' : `重试失败任务 (${status?.tasks?.failed || 0})`}
            </Button>
          )}
          {['completed', 'failed', 'reviewing', 'assets_ready', 'storyboards_ready', 'video_ready'].includes(state) && (
            <Button icon={<ReloadOutlined />} onClick={() => resetWorkflow(entityId)}>重置</Button>
          )}
          {!isEpisodeMode && (state === 'idle' || state === 'failed') && (
            <Button type="primary" icon={<RocketOutlined />} loading={loading} onClick={() => runAll!(projectId)}>
              一键执行全部
            </Button>
          )}
        </Space>
      </div>

      {error && <Alert message={error} type="error" showIcon closable style={{ marginBottom: 16 }} />}
      {status?.error && <Alert message={status.error} type="error" showIcon style={{ marginBottom: 16 }} />}

      {status?.tasks && ['generating_assets', 'generating_storyboards', 'generating_keyframes', 'generating_video'].includes(state) && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space size="large">
            <span>待处理: <strong>{status.tasks.pending}</strong></span>
            <span>进行中: <strong>{status.tasks.running}</strong></span>
            <span>已完成: <strong>{status.tasks.completed}</strong></span>
            <span>失败: <strong style={{ color: status.tasks.failed > 0 ? '#ff4d4f' : undefined }}>{status.tasks.failed}</strong></span>
          </Space>
        </Card>
      )}

      <Steps
        current={viewingStep === -1 ? 0 : viewingStep}
        status={state === 'failed' && !isViewingPast ? 'error' : undefined}
        items={[
          { title: '剧本审核', description: 'AI 分析 + 审核 + 修改' },
          { title: '素材生成', description: '角色/场景/道具素材卡片' },
          { title: '分镜生成', description: 'AI 生成分镜 JSON' },
          { title: '首尾帧生成', description: '生成首尾帧图片' },
          { title: '视频生成', description: '合成最终视频' },
        ]}
        onChange={handleStepClick}
        style={{ marginBottom: 32 }}
      />

      {isViewingPast && (
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <Tag color="blue" style={{ cursor: 'pointer' }} onClick={goToCurrentStep}>
            <EyeOutlined /> 查看历史步骤 · 点击返回当前步骤
          </Tag>
        </div>
      )}

      <Card>
        {showStep1 && <Step1Analysis projectId={projectId} episodeId={episodeId} />}
        {showStep2 && <Step2Assets projectId={projectId} episodeId={episodeId} />}
        {showStep3 && <Step3Storyboards projectId={projectId} episodeId={episodeId} />}
        {showStep4 && <Step4Keyframes projectId={projectId} episodeId={episodeId} />}
        {showStep5 && <Step5Video projectId={projectId} episodeId={episodeId} />}
      </Card>
    </div>
  );
};

export default WorkflowWizard;
