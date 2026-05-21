import React, { useState, useEffect } from 'react';
import { Card, Button, Typography, message, Select, Empty, Row, Col, Tag, Space, Modal, Spin } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTemplateStore, useProjectStore } from '../../stores';

const { Title, Paragraph, Text } = Typography;
const { Option } = Select;

const categoryLabels: Record<string, { text: string; color: string }> = {
  drama: { text: '短剧', color: 'red' }, film: { text: '电影', color: 'blue' },
  mv: { text: 'MV', color: 'purple' }, custom: { text: '自定义', color: 'green' },
};
const categoryIcons: Record<string, string> = { drama: '🎬', film: '🎬', mv: '🎵', custom: '✨' };

const Templates: React.FC = () => {
  const navigate = useNavigate();
  const { templates, loading, fetchTemplates, applyTemplate, deleteTemplate } = useTemplateStore();
  const { projects, fetchProjects } = useProjectStore();
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewStructure, setPreviewStructure] = useState<any>(null);
  const [previewName, setPreviewName] = useState('');

  useEffect(() => { fetchTemplates(categoryFilter ? { category: categoryFilter } : undefined); }, [categoryFilter]);

  const handleApply = (templateId: number) => {
    setSelectedTemplateId(templateId);
    fetchProjects({ limit: 100 });
    setApplyModalOpen(true);
  };

  const handleConfirmApply = async () => {
    if (!selectedTemplateId || !selectedProjectId) { message.info('请选择项目'); return; }
    setApplyLoading(true);
    try {
      await applyTemplate(selectedTemplateId, selectedProjectId);
      message.success('模板已应用');
      setApplyModalOpen(false);
    } catch { message.error('应用失败'); } finally { setApplyLoading(false); }
  };

  const handlePreview = (template: any) => {
    try { setPreviewStructure(JSON.parse(template.structure)); } catch { setPreviewStructure(null); }
    setPreviewName(template.name);
    setPreviewModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    try { await deleteTemplate(id); message.success('删除成功'); } catch { message.error('删除失败'); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>模板中心</Title>
          <Select placeholder="分类" style={{ width: 120 }} allowClear value={categoryFilter} onChange={setCategoryFilter}>
            <Option value="drama">短剧</Option><Option value="film">电影</Option><Option value="mv">MV</Option><Option value="custom">自定义</Option>
          </Select>
        </Space>
        <Text type="secondary">{templates.length} 个模板</Text>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div> :
       templates.length === 0 ? <Empty description="暂无模板" /> : (
        <Row gutter={[16, 16]}>
          {templates.map(t => {
            const cat = categoryLabels[t.category] || { text: t.category, color: 'default' };
            return (
              <Col key={t.id} xs={24} sm={12} md={8} lg={6}>
                <Card hoverable actions={[
                  <Button type="link" onClick={() => handlePreview(t)}>预览</Button>,
                  <Button type="link" onClick={() => handleApply(t.id)}>应用</Button>,
                  !t.builtin ? <Button type="link" danger onClick={() => handleDelete(t.id)}>删除</Button> : <span />,
                ]}>
                  <div style={{ textAlign: 'center', fontSize: 48, marginBottom: 12 }}>{categoryIcons[t.category] || '📋'}</div>
                  <Tag color={cat.color} style={{ marginBottom: 8 }}>{cat.text}</Tag>
                  {t.builtin ? <Tag color="gold" style={{ marginBottom: 8 }}>内置</Tag> : null}
                  <Title level={5} style={{ margin: '0 0 4px' }}>{t.name}</Title>
                  <Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: 0, fontSize: 12 }}>{t.description}</Paragraph>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}
      <Modal title="应用模板" open={applyModalOpen} onOk={handleConfirmApply} onCancel={() => setApplyModalOpen(false)} confirmLoading={applyLoading} okText="应用">
        <Paragraph>将模板应用到项目：</Paragraph>
        <Select placeholder="选择项目" style={{ width: '100%' }} value={selectedProjectId} onChange={setSelectedProjectId}>
          {projects.map((p: any) => <Option key={p.id} value={p.id}>{p.title}</Option>)}
        </Select>
        <Paragraph type="secondary" style={{ marginTop: 12, fontSize: 12 }}>注意：将在项目中创建新的章节、场景和分镜结构。</Paragraph>
      </Modal>
      <Modal title={`模板预览: ${previewName}`} open={previewModalOpen} onCancel={() => setPreviewModalOpen(false)} footer={null} width={500}>
        {previewStructure?.chapters?.map((ch: any, ci: number) => (
          <div key={ci} style={{ marginBottom: 8 }}>
            <Text strong>{ch.title}</Text>
            {ch.scenes?.map((sc: any, si: number) => (
              <div key={si} style={{ marginLeft: 16, fontSize: 12, color: '#666' }}>{sc.title} ({sc.storyboards?.length || 0} 分镜)</div>
            ))}
          </div>
        ))}
      </Modal>
    </div>
  );
};

export default Templates;
