import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, Select, Empty, Spin, Tag, Space, Row, Col } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { useStoryboardStore } from '../../stores';
import { useProjectSelector, useExport } from '../../hooks';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const cameraAngleMap: Record<string, string> = { wide: '远景', medium: '中景', close: '近景', extreme_close: '特写', high: '俯拍', low: '仰拍', dutch: '倾斜' };
const cameraMovementMap: Record<string, string> = { static: '固定', pan: '横摇', tilt: '俯仰', zoom_in: '推', zoom_out: '拉', dolly: '推拉', crane: '升降', tracking: '跟拍' };

const StoryboardPreview: React.FC = () => {
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { chapters, loading, fetchChapters } = useStoryboardStore();
  const { exportJSON } = useExport();

  useEffect(() => { if (selectedProjectId) fetchChapters(selectedProjectId); }, [selectedProjectId]);

  const handleExport = () => {
    if (!chapters.length) return;
    exportJSON({ project_id: selectedProjectId, chapters, exported_at: new Date().toISOString() }, `storyboards-${selectedProjectId}.json`);
  };

  const totalStoryboards = chapters.reduce((sum: number, ch: any) => sum + ch.scenes.reduce((s: number, sc: any) => s + sc.storyboards.length, 0), 0);
  const totalDuration = chapters.reduce((sum: number, ch: any) => sum + ch.scenes.reduce((s: number, sc: any) => s + sc.storyboards.reduce((ds: number, sb: any) => ds + (sb.duration || 0), 0), 0), 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>分镜预览</Title>
          <Select placeholder="选择项目" style={{ width: 200 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
        </Space>
        <Space>
          <Text type="secondary">{totalStoryboards} 个分镜 · {totalDuration.toFixed(1)}s</Text>
          <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!chapters.length}>导出JSON</Button>
        </Space>
      </div>
      {!selectedProjectId ? <Empty description="请先选择项目" /> :
       loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div> :
       chapters.length === 0 ? <Empty description="暂无分镜数据，请先运行剧本分析" /> :
       chapters.map((chapter: any) => (
        <div key={chapter.id} style={{ marginBottom: 32 }}>
          <Title level={3}>{chapter.title}</Title>
          {chapter.scenes.map((scene: any) => (
            <Card key={scene.id} size="small" style={{ marginBottom: 16 }} title={<Space><Text strong>{scene.title}</Text><Text type="secondary" style={{ fontSize: 12 }}>{scene.description?.substring(0, 60)}</Text></Space>}>
              <Row gutter={[16, 16]}>
                {scene.storyboards.map((sb: any, idx: number) => (
                  <Col key={sb.id} xs={24} sm={12} md={8} lg={6}>
                    <Card size="small" style={{ background: '#fafafa', borderColor: '#e8e8e8' }} title={<Space><Tag color="blue">{idx + 1}</Tag><Text strong>{sb.title}</Text></Space>}>
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <div>
                          <Tag>{cameraAngleMap[sb.camera_angle] || sb.camera_angle}</Tag>
                          {sb.camera_movement && <Tag color="green">{cameraMovementMap[sb.camera_movement] || sb.camera_movement}</Tag>}
                          <Tag color="orange">{sb.duration}s</Tag>
                        </div>
                        <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12 }}>{sb.description}</Paragraph>
                        {sb.dialogues && sb.dialogues.length > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {sb.dialogues.map((d: any, di: number) => <div key={di} style={{ fontSize: 12, color: '#666', padding: '2px 0' }}>💬 {d.content}</div>)}
                          </div>
                        )}
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </Card>
          ))}
        </div>
       ))
      }
    </div>
  );
};

export default StoryboardPreview;
