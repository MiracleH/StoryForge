import React, { useEffect } from 'react';
import { Card, Descriptions, Button, Space, Typography, message, Tabs, Spin, Table, Tag, Popconfirm, Empty, List } from 'antd';
import { EditOutlined, ArrowLeftOutlined, PlusOutlined, FileTextOutlined, DeleteOutlined, PlayCircleOutlined, DownloadOutlined, HistoryOutlined, RollbackOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectStore, useCharacterStore, useVideoStore, useStoryboardStore, useVersionStore, useEpisodeStore } from '../../stores';
import { useExport } from '../../hooks';
import { projectAPI } from '../../services/api';

const { Title, Paragraph, Text } = Typography;

const ProjectDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);

  const { currentProject: project, loading, fetchProject } = useProjectStore();
  const { characters, fetchCharacters, deleteCharacter } = useCharacterStore();
  const { videos, fetchVideos, createVideo, deleteVideo } = useVideoStore();
  const { chapters, loading: chaptersLoading, fetchChapters } = useStoryboardStore();
  const { versions, loading: versionsLoading, fetchVersions, createVersion, restoreVersion, deleteVersion } = useVersionStore();
  const { episodes, loading: episodesLoading, fetchEpisodes, deleteEpisode } = useEpisodeStore();
  const { exportBlob } = useExport();

  useEffect(() => { fetchProject(projectId); }, [projectId]);

  // 切换项目时重新拉取已缓存的数据
  useEffect(() => {
    fetchEpisodes(projectId);
    fetchCharacters(projectId);
    fetchChapters(projectId);
    fetchVideos(projectId);
  }, [projectId]);

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = { draft: '草稿', in_progress: '进行中', completed: '已完成', archived: '已归档' };
    return statusMap[status] || status;
  };

  const getWorkflowStateTag = (state: string) => {
    const map: Record<string, { color: string; text: string }> = {
      idle: { color: 'default', text: '待开始' },
      analyzing: { color: 'processing', text: '分析中' },
      reviewing: { color: 'warning', text: '审核中' },
      generating_assets: { color: 'processing', text: '生成素材' },
      assets_ready: { color: 'success', text: '素材就绪' },
      generating_storyboards: { color: 'processing', text: '生成分镜' },
      storyboards_ready: { color: 'success', text: '分镜就绪' },
      generating_keyframes: { color: 'processing', text: '生成首尾帧' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
    };
    const { color, text } = map[state] || { color: 'default', text: state };
    return <Tag color={color}>{text}</Tag>;
  };

  const handleDeleteEpisode = async (episodeId: number) => {
    try {
      await deleteEpisode(episodeId);
      message.success('剧集已删除');
    } catch {
      message.error('删除失败');
    }
  };

  const getVideoStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '等待中' }, processing: { color: 'processing', text: '处理中' },
      completed: { color: 'success', text: '已完成' }, failed: { color: 'error', text: '失败' },
    };
    const { color, text } = statusMap[status] || { color: 'default', text: status };
    return <Tag color={color}>{text}</Tag>;
  };

  const handleDeleteCharacter = async (charId: number) => {
    try { await deleteCharacter(charId); message.success('删除成功'); } catch { message.error('删除失败'); }
  };

  const handleCreateVideo = async () => {
    try { await createVideo({ project_id: projectId, title: `${project?.title} - 视频` }); message.success('视频任务已创建'); } catch { message.error('创建失败'); }
  };

  const handleDeleteVideo = async (videoId: number) => {
    try { await deleteVideo(videoId); message.success('删除成功'); } catch { message.error('删除失败'); }
  };

  const handleSaveVersion = async () => {
    try { await createVersion(projectId); message.success('版本快照已保存'); } catch { message.error('保存失败'); }
  };

  const handleRestoreVersion = async (versionId: number) => {
    try {
      await restoreVersion(versionId);
      message.success('已恢复到选定版本');
      fetchChapters(projectId);
      fetchCharacters(projectId);
    } catch { message.error('恢复失败'); }
  };

  const handleDeleteVersion = async (versionId: number) => {
    try { await deleteVersion(versionId); message.success('版本已删除'); } catch { message.error('删除失败'); }
  };

  const handleExport = async () => {
    try {
      const response = await projectAPI.export(projectId);
      exportBlob(new Blob([response as any], { type: 'application/json' }), `project-${id}-export.json`);
    } catch { message.error('导出失败'); }
  };

  if (loading || !project) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><Spin size="large" /></div>;
  }

  const characterColumns = [
    { title: '角色名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '性格', dataIndex: 'personality', key: 'personality', ellipsis: true },
    { title: '风格', dataIndex: 'style', key: 'style', render: (style: string) => <Tag>{{ anime: '日系动漫', manga: '漫画', realistic: '写实', cartoon: '卡通' }[style] || style}</Tag> },
    { title: '操作', key: 'action', render: (_: any, record: any) => <Popconfirm title="确定删除？" onConfirm={() => handleDeleteCharacter(record.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> },
  ];

  const videoColumns = [
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: string) => getVideoStatusTag(s) },
    { title: '分辨率', dataIndex: 'resolution', key: 'resolution' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
    { title: '操作', key: 'action', render: (_: any, record: any) => <Popconfirm title="确定删除？" onConfirm={() => handleDeleteVideo(record.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> },
  ];

  const episodeColumns = [
    { title: '集数', dataIndex: 'episode_number', key: 'episode_number', width: 80, render: (n: number) => <Tag color="blue">第 {n} 集</Tag> },
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '时长(分)', dataIndex: 'target_minutes', key: 'target_minutes', width: 100 },
    { title: '工作流状态', dataIndex: 'workflow_state', key: 'workflow_state', render: (s: string) => getWorkflowStateTag(s) },
    { title: '风格', dataIndex: 'style_preset', key: 'style_preset', width: 80 },
    {
      title: '操作', key: 'action', width: 280,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" onClick={() => navigate(`/projects/${id}/episodes/${record.id}/workflow`)}>工作流</Button>
          <Button type="link" size="small" onClick={() => navigate(`/projects/${id}/episodes/setup`)}>编辑</Button>
          <Popconfirm title="确定删除此剧集？相关数据将被清除。" onConfirm={() => handleDeleteEpisode(record.id)}>
            <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const items = [
    {
      key: 'overview', label: '项目概览',
      children: (
        <Descriptions bordered column={{ xxl: 4, xl: 3, lg: 3, md: 2, sm: 1, xs: 1 }}>
          <Descriptions.Item label="项目名称">{project.title}</Descriptions.Item>
          <Descriptions.Item label="状态">{getStatusText(project.status)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{new Date(project.created_at).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{new Date(project.updated_at).toLocaleString()}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>{project.description || '暂无描述'}</Descriptions.Item>
        </Descriptions>
      ),
    },
    {
      key: 'episodes', label: '剧集管理',
      children: (
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
            <Text type="secondary">
              {episodes.length > 0 ? `共 ${episodes.length} 个剧集` : '暂无剧集'}
            </Text>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(`/projects/${id}/episodes/setup`)}>
                {episodes.length > 0 ? '管理剧集' : 'AI 建议剧集'}
              </Button>
            </Space>
          </div>
          <Table
            columns={episodeColumns}
            dataSource={episodes}
            rowKey="id"
            loading={episodesLoading}
            pagination={false}
            locale={{ emptyText: <Empty description="暂无剧集，点击上方按钮让 AI 分析小说并建议集数" /> }}
          />
        </Card>
      ),
    },
    {
      key: 'novel', label: '小说文本',
      children: (
        <Card>
          {project.novel_text ? (
            <>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.8', marginBottom: 16 }}>{project.novel_text}</div>
              <Button type="primary" icon={<FileTextOutlined />} onClick={() => navigate(`/script-analysis/${id}`)}>分析剧本</Button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p>暂无小说文本</p>
              <Space>
                <Button type="primary" icon={<PlusOutlined />}>导入小说文本</Button>
                <Button icon={<FileTextOutlined />} onClick={() => navigate(`/script-analysis/${id}`)}>直接输入分析</Button>
              </Space>
            </div>
          )}
        </Card>
      ),
    },
    {
      key: 'characters', label: '角色管理',
      children: (
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/characters')}>创建角色</Button>
          </div>
          <Table columns={characterColumns} dataSource={characters} rowKey="id" pagination={false} locale={{ emptyText: <Empty description="暂无角色，请先运行剧本分析" /> }} />
        </Card>
      ),
    },
    {
      key: 'storyboards', label: '分镜绘制',
      children: (
        <Card loading={chaptersLoading}>
          {chapters.length > 0 ? chapters.map((chapter: any) => (
            <div key={chapter.id} style={{ marginBottom: 24 }}>
              <Title level={4}>{chapter.title}</Title>
              {chapter.scenes?.map((scene: any) => (
                <Card key={scene.id} size="small" style={{ marginBottom: 12 }} title={scene.title}>
                  <Paragraph type="secondary">{scene.description}</Paragraph>
                  {scene.storyboards?.length > 0 ? (
                    <List size="small" dataSource={scene.storyboards} renderItem={(sb: any) => (
                      <List.Item><Space><Tag>{sb.camera_angle}</Tag><span>{sb.title}</span><span style={{ color: '#999' }}>{sb.duration}s</span></Space></List.Item>
                    )} />
                  ) : <Empty description="暂无分镜" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
                </Card>
              ))}
            </div>
          )) : (
            <Empty description="暂无分镜数据，请先运行剧本分析">
              <Button type="primary" onClick={() => navigate(`/script-analysis/${id}`)}>去分析剧本</Button>
            </Empty>
          )}
        </Card>
      ),
    },
    {
      key: 'videos', label: '视频合成',
      children: (
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleCreateVideo}>生成视频</Button>
          </div>
          <Table columns={videoColumns} dataSource={videos} rowKey="id" pagination={false} locale={{ emptyText: <Empty description="暂无视频" /> }} />
        </Card>
      ),
    },
    {
      key: 'versions', label: '版本历史',
      children: (
        <Card>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="primary" icon={<HistoryOutlined />} onClick={handleSaveVersion}>保存当前版本</Button>
          </div>
          <Table
            dataSource={versions} rowKey="id" loading={versionsLoading} pagination={false}
            locale={{ emptyText: <Empty description="暂无版本快照" /> }}
            columns={[
              { title: '版本', dataIndex: 'version_num', key: 'version_num', width: 80, render: (n: number) => <Tag>v{n}</Tag> },
              { title: '标签', dataIndex: 'label', key: 'label' },
              { title: '保存时间', dataIndex: 'created_at', key: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
              {
                title: '操作', key: 'action', width: 200,
                render: (_: any, record: any) => (
                  <Space>
                    <Popconfirm title="恢复到此版本？当前数据将被替换。" onConfirm={() => handleRestoreVersion(record.id)}>
                      <Button type="link" icon={<RollbackOutlined />}>恢复</Button>
                    </Popconfirm>
                    <Popconfirm title="确定删除此版本？" onConfirm={() => handleDeleteVersion(record.id)}>
                      <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      ),
    },
  ];

  if (!project) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">{loading ? '加载中...' : '项目不存在或已被删除'}</Text>
        </div>
        {!loading && (
          <Button style={{ marginTop: 16 }} icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回项目列表</Button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回</Button>
          <Title level={2} style={{ margin: 0 }}>{project.title}</Title>
        </Space>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => navigate(`/projects/${id}/edit`)}>编辑项目</Button>
        </Space>
      </div>
      <Card>
        <Tabs
          items={items}
          onChange={(key) => {
            if (key === 'characters' && characters.length === 0) fetchCharacters(projectId);
            if (key === 'videos' && videos.length === 0) fetchVideos(projectId);
            if (key === 'storyboards' && chapters.length === 0) fetchChapters(projectId);
            if (key === 'versions' && versions.length === 0) fetchVersions(projectId);
            if (key === 'episodes' && episodes.length === 0) fetchEpisodes(projectId);
          }}
        />
      </Card>
    </div>
  );
};

export default ProjectDetail;
