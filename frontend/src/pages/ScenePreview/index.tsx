import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Select, Empty, Spin, Tag, Space, Row, Col, Image } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { useStoryboardStore } from '../../stores';
import { useProjectSelector } from '../../hooks';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16'];
function getColor(idx: number) { return colors[idx % colors.length]; }

const ScenePreview: React.FC = () => {
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { chapters, loading, fetchChapters } = useStoryboardStore();

  useEffect(() => { if (selectedProjectId) fetchChapters(selectedProjectId); }, [selectedProjectId]);

  const allScenes = chapters.flatMap((ch: any) => ch.scenes.map((s: any) => ({ ...s, chapterTitle: ch.title })));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>场景预览</Title>
          <Select placeholder="选择项目" style={{ width: 200 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
        </Space>
        <Text type="secondary">{allScenes.length} 个场景</Text>
      </div>
      {!selectedProjectId ? <Empty description="请先选择项目" /> :
       loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div> :
       allScenes.length === 0 ? <Empty description="暂无场景数据，请先运行剧本分析" /> :
       <Row gutter={[16, 16]}>
         {allScenes.map((scene: any, idx: number) => (
           <Col key={scene.id} xs={24} sm={12} md={8} lg={6}>
             <Card
               hoverable
               cover={scene.background_image ? (
                 <div style={{ height: 160, overflow: 'hidden', background: '#f0f0f0' }}>
                   <Image src={scene.background_image} style={{ objectFit: 'cover', width: '100%', height: 160 }} preview={false} fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
                 </div>
               ) : (
                 <div style={{ height: 160, background: `linear-gradient(135deg, ${getColor(idx)}22, ${getColor(idx)}44)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <PictureOutlined style={{ fontSize: 48, color: getColor(idx) }} />
                 </div>
               )}
             >
               <Tag color="blue" style={{ marginBottom: 8 }}>{scene.chapterTitle}</Tag>
               <Title level={5} style={{ margin: '0 0 4px' }}>{scene.title}</Title>
               <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '0 0 8px', fontSize: 12 }}>{scene.description}</Paragraph>
               <Space size={4} wrap>
                 <Tag>{scene.storyboards.length} 分镜</Tag>
                 <Tag color="orange">{scene.storyboards.reduce((sum: number, sb: any) => sum + (sb.duration || 0), 0).toFixed(1)}s</Tag>
               </Space>
             </Card>
           </Col>
         ))}
       </Row>
      }
    </div>
  );
};

export default ScenePreview;
