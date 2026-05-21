import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, message, Select, Empty, Table, Tag, Space, Popconfirm, Alert, Modal, Slider, Form } from 'antd';
import { PlusOutlined, DeleteOutlined, PlayCircleOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useVideoStore } from '../../stores';
import { useProjectSelector, usePolling } from '../../hooks';

const { Title } = Typography;
const { Option } = Select;

const Videos: React.FC = () => {
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { videos, audioAssets, ffmpegAvailable, loading, fetchVideos, fetchFFmpegStatus, fetchAudioAssets, createVideo, deleteVideo } = useVideoStore();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => { fetchFFmpegStatus(); }, []);
  useEffect(() => { if (selectedProjectId) fetchVideos(selectedProjectId); }, [selectedProjectId]);

  const hasInProgress = videos.some(v => v.status === 'pending' || v.status === 'processing');
  usePolling(() => { if (selectedProjectId) fetchVideos(selectedProjectId); }, 5000, hasInProgress && !!selectedProjectId);

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({ resolution: '1080p', bgm_volume: 0.5 });
    fetchAudioAssets();
    setCreateModalOpen(true);
  };

  const handleCreateVideo = async () => {
    if (!selectedProjectId) return;
    setCreateLoading(true);
    try {
      const values = await form.validateFields();
      await createVideo({ project_id: selectedProjectId, ...values });
      message.success('视频任务已创建');
      setCreateModalOpen(false);
    } catch {
      message.error('创建失败');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteVideo = async (id: number) => {
    try {
      await deleteVideo(id);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  const getStatusTag = (status: string) => {
    const map: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '等待中' }, processing: { color: 'processing', text: '处理中' },
      completed: { color: 'success', text: '已完成' }, failed: { color: 'error', text: '失败' },
    };
    const { color, text } = map[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  };

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title', render: (t: string) => t || '未命名' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => getStatusTag(s) },
    { title: '分辨率', dataIndex: 'resolution', key: 'resolution' },
    { title: '时长', dataIndex: 'duration', key: 'duration', render: (d: number) => d ? `${d.toFixed(1)}s` : '-' },
    { title: 'BGM', dataIndex: 'bgm_path', key: 'bgm_path', render: (p: string) => p ? <Tag color="purple">有</Tag> : '-' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
    {
      title: '操作', key: 'action',
      render: (_: any, record: any) => (
        <Space>
          {record.status === 'completed' && record.file_path && (
            <Button type="link" icon={<DownloadOutlined />} href={record.file_path} target="_blank">下载</Button>
          )}
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteVideo(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      {ffmpegAvailable === false && (
        <Alert message="FFmpeg 未安装" description="视频渲染需要 FFmpeg 支持。请安装 FFmpeg 后重启后端服务。" type="warning" showIcon closable style={{ marginBottom: 16 }} />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>视频合成</Title>
          <Select placeholder="选择项目" style={{ width: 200 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => selectedProjectId && fetchVideos(selectedProjectId)} disabled={!selectedProjectId}>刷新</Button>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleOpenCreate} disabled={!selectedProjectId || ffmpegAvailable === false}>生成视频</Button>
        </Space>
      </div>
      <Card>
        {!selectedProjectId ? <Empty description="请先选择一个项目" /> : (
          <Table columns={columns} dataSource={videos} rowKey="id" loading={loading} pagination={false} locale={{ emptyText: <Empty description="暂无视频" /> }} />
        )}
      </Card>
      <Modal title="生成视频" open={createModalOpen} onOk={handleCreateVideo} onCancel={() => setCreateModalOpen(false)} confirmLoading={createLoading}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="视频标题"><input style={{ width: '100%', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: 6 }} placeholder="可选" /></Form.Item>
          <Form.Item name="resolution" label="分辨率"><Select><Option value="480p">480p</Option><Option value="720p">720p</Option><Option value="1080p">1080p</Option></Select></Form.Item>
          <Form.Item name="bgm_asset_id" label="背景音乐"><Select placeholder="无背景音乐" allowClear>{audioAssets.map(a => <Option key={a.id} value={a.id}>{a.name}</Option>)}</Select></Form.Item>
          <Form.Item name="bgm_volume" label="BGM 音量"><Slider min={0} max={1} step={0.1} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Videos;
