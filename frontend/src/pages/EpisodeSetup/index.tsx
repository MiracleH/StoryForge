import React, { useEffect, useState } from 'react';
import { Card, Typography, Button, Slider, InputNumber, Space, Spin, message, Table, Tag, Alert, Input } from 'antd';
import { ArrowLeftOutlined, RobotOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useEpisodeStore, useProjectStore } from '../../stores';

const { Title, Text, Paragraph } = Typography;

interface EditableEpisode {
  episode_number: number;
  title: string;
  summary: string;
  target_minutes: number;
  start_char: number;
  end_char: number;
  novel_text_segment?: string;
}

const EpisodeSetup: React.FC = () => {
  const navigate = useNavigate();
  const { id: projectId } = useParams<{ id: string }>();
  const pid = Number(projectId);

  const { currentProject, fetchProject } = useProjectStore();
  const { suggestion, suggestLoading, error, suggest, createBatch, loading: createLoading } = useEpisodeStore();

  const [episodeCount, setEpisodeCount] = useState(1);
  const [targetMinutes, setTargetMinutes] = useState(3);
  const [episodes, setEpisodes] = useState<EditableEpisode[]>([]);
  const [reasoning, setReasoning] = useState('');

  useEffect(() => {
    fetchProject(pid);
    suggest(pid);
  }, [pid]);

  useEffect(() => {
    if (suggestion) {
      setEpisodeCount(suggestion.suggested_episodes);
      setTargetMinutes(suggestion.recommended_minutes);
      setReasoning(suggestion.reasoning);
      setEpisodes(
        suggestion.episode_breaks.map((eb) => ({
          episode_number: eb.episode_number,
          title: eb.title,
          summary: eb.summary,
          target_minutes: suggestion.recommended_minutes,
          start_char: eb.start_char,
          end_char: eb.end_char,
        }))
      );
    }
  }, [suggestion]);

  // Sync target minutes to all episodes
  const handleMinutesChange = (val: number) => {
    setTargetMinutes(val);
    setEpisodes((prev) => prev.map((ep) => ({ ...ep, target_minutes: val })));
  };

  // Adjust episode count
  const handleCountChange = (val: number) => {
    setEpisodeCount(val);
    setEpisodes((prev) => {
      if (val > prev.length) {
        const added = [];
        for (let i = prev.length; i < val; i++) {
          added.push({
            episode_number: i + 1,
            title: `第 ${i + 1} 集`,
            summary: '',
            target_minutes: targetMinutes,
            start_char: 0,
            end_char: 0,
          });
        }
        return [...prev, ...added];
      }
      return prev.slice(0, val).map((ep, idx) => ({ ...ep, episode_number: idx + 1 }));
    });
  };

  const updateEpisodeTitle = (idx: number, title: string) => {
    setEpisodes((prev) => prev.map((ep, i) => (i === idx ? { ...ep, title } : ep)));
  };

  const handleConfirm = async () => {
    if (episodes.length === 0) {
      message.warning('请至少创建一个剧集');
      return;
    }

    const novelText = currentProject?.novel_text || '';
    const totalChars = novelText.length;

    const batch = episodes.map((ep) => {
      // If we have valid char offsets from AI suggestion, use them
      let segment = ep.novel_text_segment || '';
      if (!segment && ep.start_char < ep.end_char && ep.end_char <= totalChars) {
        segment = novelText.slice(ep.start_char, ep.end_char);
      }
      // If still no segment, split evenly
      if (!segment && totalChars > 0) {
        const chunkSize = Math.ceil(totalChars / episodes.length);
        const start = (ep.episode_number - 1) * chunkSize;
        segment = novelText.slice(start, start + chunkSize);
      }

      return {
        title: ep.title,
        episode_number: ep.episode_number,
        target_minutes: ep.target_minutes,
        novel_text_segment: segment || undefined,
      };
    });

    try {
      await createBatch(pid, batch);
      message.success(`已创建 ${batch.length} 个剧集`);
      navigate(`/projects/${pid}`);
    } catch (err: any) {
      message.error(err.message || '创建剧集失败');
    }
  };

  const columns = [
    {
      title: '集数',
      dataIndex: 'episode_number',
      width: 70,
      render: (num: number) => <Tag color="blue">第 {num} 集</Tag>,
    },
    {
      title: '标题',
      dataIndex: 'title',
      render: (title: string, _: any, idx: number) => (
        <Input
          value={title}
          size="small"
          onChange={(e) => updateEpisodeTitle(idx, e.target.value)}
        />
      ),
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      ellipsis: true,
      render: (text: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{text || '—'}</Text>
      ),
    },
    {
      title: '时长(分)',
      dataIndex: 'target_minutes',
      width: 90,
      render: (mins: number) => <Text>{mins}</Text>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${pid}`)}>返回项目</Button>
          <Title level={2} style={{ margin: 0 }}>剧集设置</Title>
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => suggest(pid)} loading={suggestLoading}>重新分析</Button>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleConfirm}
            loading={createLoading}
            disabled={episodes.length === 0}
          >
            确认创建剧集
          </Button>
        </Space>
      </div>

      {currentProject && (
        <Alert
          type="info"
          style={{ marginBottom: 16 }}
          message={`项目: ${currentProject.title}`}
          description={currentProject.novel_text ? `小说文本: ${currentProject.novel_text.length} 字` : '未导入小说文本'}
        />
      )}

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {suggestLoading && (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text><RobotOutlined /> AI 正在分析小说文本，建议集数和时长...</Text>
          </div>
        </Card>
      )}

      {suggestion && !suggestLoading && (
        <>
          {reasoning && (
            <Card size="small" style={{ marginBottom: 16 }}>
              <Text type="secondary"><RobotOutlined /> AI 分析: {reasoning}</Text>
            </Card>
          )}

          <Card title="集数配置" style={{ marginBottom: 16 }}>
            <Space size="large" wrap>
              <div style={{ minWidth: 200 }}>
                <Text strong>集数: {episodeCount}</Text>
                <Slider
                  min={1}
                  max={20}
                  value={episodeCount}
                  onChange={handleCountChange}
                  marks={{ 1: '1', 5: '5', 10: '10', 15: '15', 20: '20' }}
                />
              </div>
              <div style={{ minWidth: 200 }}>
                <Text strong>每集时长（分钟）: {targetMinutes}</Text>
                <Slider
                  min={1}
                  max={10}
                  step={0.5}
                  value={targetMinutes}
                  onChange={handleMinutesChange}
                  marks={{ 1: '1', 3: '3', 5: '5', 10: '10' }}
                />
              </div>
            </Space>
          </Card>

          <Card title="剧集列表">
            <Table
              dataSource={episodes}
              columns={columns}
              rowKey="episode_number"
              pagination={false}
              size="small"
            />
          </Card>
        </>
      )}
    </div>
  );
};

export default EpisodeSetup;
