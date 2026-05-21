import React, { useState } from 'react';
import { Card, Input, Button, Typography, message, Spin, Result, Descriptions, Tag, Progress, Table, Tabs } from 'antd';
import { FileTextOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { scriptAnalysisAPI } from '../../services/api';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;

interface Chapter {
  title: string;
  content: string;
  order_index: number;
  scenes: Scene[];
}

interface Scene {
  title: string;
  description: string;
  order_index: number;
  storyboards: Storyboard[];
}

interface Storyboard {
  title: string;
  description: string;
  duration: number;
  camera_angle: string;
  order_index: number;
}

interface Character {
  name: string;
  description: string;
  personality: string;
}

interface Sentiment {
  positive: number;
  negative: number;
  neutral: number;
  dominant: string;
}

interface AnalysisResult {
  chapters: Chapter[];
  characters: Character[];
  sentiment: Sentiment;
  total_chars: number;
  total_lines: number;
}

const ScriptAnalysis: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = async () => {
    if (!text.trim()) {
      message.warning('请输入剧本文本');
      return;
    }

    if (!projectId) {
      message.error('项目ID不存在');
      return;
    }

    setLoading(true);
    try {
      const response = await scriptAnalysisAPI.analyze({
        project_id: parseInt(projectId),
        text: text
      });

      setResult(response.data.analysis);
      message.success('剧本分析完成！');
    } catch (error: any) {
      message.error(error.message || '分析请求失败');
    } finally {
      setLoading(false);
    }
  };

  const renderChapters = () => {
    if (!result?.chapters) return null;

    const columns = [
      {
        title: '章节',
        dataIndex: 'title',
        key: 'title',
      },
      {
        title: '场景数',
        key: 'scenes',
        render: (_: any, record: Chapter) => record.scenes.length,
      },
      {
        title: '分镜数',
        key: 'storyboards',
        render: (_: any, record: Chapter) =>
          record.scenes.reduce((sum, scene) => sum + scene.storyboards.length, 0),
      },
      {
        title: '字数',
        key: 'chars',
        render: (_: any, record: Chapter) => record.content.length,
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={result.chapters}
        rowKey="order_index"
        pagination={false}
      />
    );
  };

  const renderCharacters = () => {
    if (!result?.characters) return null;

    const columns = [
      {
        title: '角色名',
        dataIndex: 'name',
        key: 'name',
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
        ellipsis: true,
      },
      {
        title: '性格',
        dataIndex: 'personality',
        key: 'personality',
      },
    ];

    return (
      <Table
        columns={columns}
        dataSource={result.characters}
        rowKey="name"
        pagination={false}
      />
    );
  };

  const renderSentiment = () => {
    if (!result?.sentiment) return null;

    const { sentiment } = result;

    return (
      <div className="space-y-4">
        <Descriptions title="情感分析" bordered>
          <Descriptions.Item label="主导情感">
            <Tag color={
              sentiment.dominant === 'positive' ? 'green' :
              sentiment.dominant === 'negative' ? 'red' : 'blue'
            }>
              {sentiment.dominant === 'positive' ? '积极' :
               sentiment.dominant === 'negative' ? '消极' : '中性'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="积极情感">
            <Progress percent={Math.round(sentiment.positive * 100)} size="small" />
          </Descriptions.Item>
          <Descriptions.Item label="消极情感">
            <Progress percent={Math.round(sentiment.negative * 100)} size="small" />
          </Descriptions.Item>
          <Descriptions.Item label="中性情感">
            <Progress percent={Math.round(sentiment.neutral * 100)} size="small" />
          </Descriptions.Item>
        </Descriptions>
      </div>
    );
  };

  return (
    <div className="p-6">
      <Title level={2}>
        <FileTextOutlined className="mr-2" />
        剧本分析
      </Title>

      <Card className="mb-6">
        <div className="mb-4">
          <Text strong>请输入剧本文本：</Text>
          <Text type="secondary" className="ml-2">
            支持自动识别章节、场景、角色和对话
          </Text>
        </div>

        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="请粘贴或输入小说/剧本文本..."
          rows={10}
          className="mb-4"
        />

        <div className="flex gap-4">
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleAnalyze}
            loading={loading}
            size="large"
          >
            开始分析
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              setText('');
              setResult(null);
            }}
            size="large"
          >
            重置
          </Button>

        </div>
      </Card>

      {loading && (
        <Card>
          <div className="text-center py-10">
            <Spin size="large" />
            <Paragraph className="mt-4">正在分析剧本，请稍候...</Paragraph>
          </div>
        </Card>
      )}

      {result && !loading && (
        <Card>
          <Result
            status="success"
            title="剧本分析完成"
            subTitle={`共识别 ${result.chapters.length} 个章节，${result.characters.length} 个角色，${result.total_chars} 字`}
          />

          <Descriptions bordered className="mb-6">
            <Descriptions.Item label="总字数">{result.total_chars}</Descriptions.Item>
            <Descriptions.Item label="总行数">{result.total_lines}</Descriptions.Item>
            <Descriptions.Item label="章节数">{result.chapters.length}</Descriptions.Item>
            <Descriptions.Item label="角色数">{result.characters.length}</Descriptions.Item>
          </Descriptions>

          <Tabs defaultActiveKey="chapters">
            <TabPane tab="章节结构" key="chapters">
              {renderChapters()}
            </TabPane>

            <TabPane tab="角色列表" key="characters">
              {renderCharacters()}
            </TabPane>

            <TabPane tab="情感分析" key="sentiment">
              {renderSentiment()}
            </TabPane>
          </Tabs>

          <div className="mt-6 flex gap-4">
            <Button
              type="primary"
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              查看项目详情
            </Button>

            <Button
              onClick={() => navigate('/storyboards')}
            >
              进入分镜编辑
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ScriptAnalysis;
