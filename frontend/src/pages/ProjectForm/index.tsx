import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Select, Spin, Upload, Space, Alert } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, UploadOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useProjectStore } from '../../stores';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const ProjectForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const { currentProject, loading, fetchProject, createProject, updateProject } = useProjectStore();

  useEffect(() => {
    if (isEdit) fetchProject(Number(id));
  }, [id]);

  useEffect(() => {
    if (isEdit && currentProject) form.setFieldsValue(currentProject);
  }, [currentProject, isEdit]);

  const handleSubmit = async (values: any) => {
    setSaving(true);
    try {
      if (isEdit) {
        await updateProject(Number(id), values);
        message.success('项目更新成功');
        navigate(`/projects/${id}`);
      } else {
        const data = await createProject({
          ...values,
          file: importFile || undefined,
        });
        message.success('项目创建成功');
        // If novel text exists, go to episode setup; otherwise go to project detail
        if (values.novel_text || importFile) {
          navigate(`/projects/${data.id}/episodes/setup`);
        } else {
          navigate(`/projects/${data.id}`);
        }
      }
    } catch (error: any) {
      message.error(error.message || '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const handleFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['txt', 'docx', 'pdf'].includes(ext)) {
      message.error('仅支持 txt/docx/pdf 文件');
      return false;
    }
    if (file.size > 20 * 1024 * 1024) {
      message.error('文件大小不能超过 20MB');
      return false;
    }
    setImportFile(file);
    return false; // 阻止自动上传
  };

  if (loading && isEdit) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><Spin size="large" /></div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={2}>{isEdit ? '编辑项目' : '创建项目'}</Title>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>返回</Button>
      </div>
      <Card>
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ status: 'draft' }} style={{ maxWidth: 600 }}>
          <Form.Item name="title" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="请输入项目名称" size="large" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <TextArea rows={3} placeholder="请输入项目描述" />
          </Form.Item>
          {isEdit && (
            <Form.Item name="status" label="项目状态">
              <Select><Option value="draft">草稿</Option><Option value="in_progress">进行中</Option><Option value="completed">已完成</Option><Option value="archived">已归档</Option></Select>
            </Form.Item>
          )}
          {!isEdit && (
            <Form.Item label="导入文件">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Upload
                  beforeUpload={handleFileSelect}
                  showUploadList={false}
                  accept=".txt,.docx,.pdf"
                >
                  <Button icon={<UploadOutlined />}>选择文件（txt/docx/pdf）</Button>
                </Upload>
                {importFile && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6 }}>
                    <FileTextOutlined />
                    <Text style={{ flex: 1 }}>{importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)</Text>
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setImportFile(null)} />
                  </div>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>上传文件后文本将自动提取到下方「小说文本」框</Text>
              </Space>
            </Form.Item>
          )}
          <Form.Item name="novel_text" label="小说文本">
            <TextArea rows={8} placeholder="可选：粘贴小说文本，后续可用于剧本分析" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
              {isEdit ? '保存修改' : '创建项目'}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ProjectForm;
