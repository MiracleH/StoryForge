import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Select, Empty, Spin, Tag, Space, message, List, Collapse } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useStoryboardStore } from '../../stores';
import { useProjectSelector } from '../../hooks';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const Storyboards: React.FC = () => {
  const navigate = useNavigate();
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { chapters, loading, fetchChapters } = useStoryboardStore();

  useEffect(() => { if (selectedProjectId) fetchChapters(selectedProjectId); }, [selectedProjectId]);

  const getCameraAngleTag = (angle: string) => {
    const angleMap: Record<string, string> = { wide: '远景', medium: '中景', close: '近景', extreme_close: '特写' };
    return <Tag>{angleMap[angle] || angle}</Tag>;
  };

  const collapseItems = chapters.map((chapter: any) => ({
    key: chapter.id,
    label: chapter.title,
    children: (
      <>
        {chapter.scenes?.length > 0 ? chapter.scenes.map((scene: any) => (
          <Card key={scene.id} size="small" style={{ marginBottom: 12 }} title={scene.title}>
            <Paragraph type="secondary" ellipsis={{ rows: 2 }}>{scene.description}</Paragraph>
            {scene.storyboards?.length > 0 ? (
              <List size="small" dataSource={scene.storyboards} renderItem={(sb: any) => (
                <List.Item>
                  <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>{getCameraAngleTag(sb.camera_angle)}<Text strong>{sb.title}</Text></Space>
                      <Text type="secondary">{sb.duration}s</Text>
                    </div>
                    <Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: 12 }} ellipsis={{ rows: 1 }}>{sb.description}</Paragraph>
                  </div>
                </List.Item>
              )} />
            ) : <Empty description="暂无分镜" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        )) : <Empty description="暂无场景" image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      </>
    ),
  }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>分镜绘制</Title>
          <Select placeholder="选择项目" style={{ width: 200 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { if (selectedProjectId) navigate(`/script-analysis/${selectedProjectId}`); else message.info('请先选择项目'); }}>创建分镜</Button>
      </div>
      <Card>
        {!selectedProjectId ? <Empty description="请先选择一个项目" /> :
         loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> :
         chapters.length > 0 ? <Collapse items={collapseItems} defaultActiveKey={chapters.length > 0 ? [chapters[0].id] : []} /> :
         <Empty description="暂无分镜数据，请先运行剧本分析"><Button type="primary" onClick={() => navigate(`/script-analysis/${selectedProjectId}`)}>去分析剧本</Button></Empty>
        }
      </Card>
    </div>
  );
};

export default Storyboards;
