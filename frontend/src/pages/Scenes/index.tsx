import React, { useState } from 'react';
import { Card, Table, Button, Space, Typography, message, Popconfirm, Modal, Form, Input, Select, Empty, Image, Upload } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined, RocketOutlined } from '@ant-design/icons';
import { useStoryboardStore, useAIStore } from '../../stores';
import { useProjectSelector, useChapterSceneSelector } from '../../hooks';
import { assetAPI } from '../../services/api';

const { Title } = Typography;
const { TextArea } = Input;
const { Option } = Select;

const Scenes: React.FC = () => {
  const { projects, selectedProjectId, setSelectedProjectId } = useProjectSelector();
  const { chapters, scenes, loading, createScene, updateScene, deleteScene, fetchScenes } = useStoryboardStore();
  const { generating, generateSceneImage } = useAIStore();
  const { selectedChapterId, setSelectedChapterId } = useChapterSceneSelector(selectedProjectId);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingScene, setEditingScene] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [form] = Form.useForm();

  const handleAdd = () => {
    setEditingScene(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingScene(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteScene(id);
      message.success('删除成功');
    } catch {
      message.error('删除失败');
    }
  };

  const handleImageUpload = async (file: any) => {
    setUploading(true);
    try {
      const res = await assetAPI.upload(file, file.name, 'scene');
      const filePath = res.data.file_path;
      form.setFieldValue('background_image', filePath);
      message.success('上传成功');
    } catch {
      message.error('上传失败');
    } finally {
      setUploading(false);
    }
    return false;
  };

  const handleGenerateSceneImage = async () => {
    if (!editingScene) return;
    try {
      const path = await generateSceneImage(editingScene.id);
      form.setFieldValue('background_image', path);
      message.success('场景背景生成成功');
      if (selectedChapterId) fetchScenes(selectedChapterId);
    } catch {
      message.error('生成失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingScene) {
        await updateScene(editingScene.id, values);
        message.success('更新成功');
      } else {
        await createScene({ ...values, chapter_id: selectedChapterId });
        message.success('创建成功');
      }
      setModalVisible(false);
    } catch {
      message.error('操作失败');
    }
  };

  const columns = [
    { title: '排序', dataIndex: 'order_index', key: 'order_index', width: 60 },
    {
      title: '背景', dataIndex: 'background_image', key: 'background_image', width: 80,
      render: (url: string) => url ? (
        <Image src={url} width={50} height={36} style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
      ) : <div style={{ width: 50, height: 36, background: '#f0f0f0', borderRadius: 4 }} />,
    },
    { title: '场景名称', dataIndex: 'title', key: 'title' },
    { title: '描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180,
      render: (t: string) => new Date(t).toLocaleString(),
    },
    {
      title: '操作', key: 'action', width: 150,
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>场景管理</Title>
          <Select placeholder="选择项目" style={{ width: 180 }} value={selectedProjectId} onChange={setSelectedProjectId}>
            {projects.map(p => <Option key={p.id} value={p.id}>{p.title}</Option>)}
          </Select>
          <Select placeholder="选择章节" style={{ width: 180 }} value={selectedChapterId} onChange={setSelectedChapterId} disabled={!chapters.length}>
            {chapters.map(c => <Option key={c.id} value={c.id}>{c.title}</Option>)}
          </Select>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} disabled={!selectedChapterId}>
          创建场景
        </Button>
      </div>

      <Card>
        {!selectedProjectId ? (
          <Empty description="请先选择项目" />
        ) : !selectedChapterId ? (
          <Empty description="请先选择章节" />
        ) : (
          <Table columns={columns} dataSource={scenes} rowKey="id" loading={loading} pagination={false} />
        )}
      </Card>

      <Modal title={editingScene ? '编辑场景' : '创建场景'} open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={520}>
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="场景名称" rules={[{ required: true, message: '请输入场景名称' }]}>
            <Input placeholder="请输入场景名称" />
          </Form.Item>
          <Form.Item name="description" label="场景描述">
            <TextArea rows={3} placeholder="请输入场景描述" />
          </Form.Item>
          <Form.Item label="背景图片">
            <Space>
              <Upload beforeUpload={handleImageUpload} showUploadList={false} accept="image/*">
                <Button icon={<UploadOutlined />} loading={uploading}>上传图片</Button>
              </Upload>
              <Button icon={<RocketOutlined />} loading={generating[`scene-${editingScene?.id}`]} onClick={handleGenerateSceneImage} disabled={!editingScene}>AI生成</Button>
              <span style={{ color: '#999', fontSize: 12 }}>或填写URL：</span>
            </Space>
          </Form.Item>
          <Form.Item name="background_image" label="">
            <Input placeholder="背景图片URL" />
          </Form.Item>
          {form.getFieldValue('background_image') && (
            <div style={{ marginBottom: 16 }}>
              <Image src={form.getFieldValue('background_image')} width={200} style={{ borderRadius: 4 }}
                fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
            </div>
          )}
          <Form.Item name="order_index" label="排序">
            <Input type="number" placeholder="排序序号" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Scenes;
