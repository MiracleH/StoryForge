import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Typography, message, Popconfirm, Select, Modal, Tag } from 'antd';
import { UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAssetStore } from '../../stores';

const { Title } = Typography;
const { Option } = Select;

const Assets: React.FC = () => {
  const { assets, loading, fetchAssets, uploadAsset, deleteAsset } = useAssetStore();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { fetchAssets({ type: typeFilter || undefined, limit: 100 }); }, [typeFilter]);

  const handleDelete = async (id: number) => {
    try { await deleteAsset(id); message.success('删除成功'); } catch { message.error('删除失败'); }
  };

  const handleUpload = async (file: any, name: string, type: string) => {
    setUploading(true);
    try { await uploadAsset(file, name, type); message.success('上传成功'); setUploadModalVisible(false); }
    catch { message.error('上传失败'); } finally { setUploading(false); }
  };

  const typeMap: Record<string, { color: string; text: string }> = {
    character: { color: 'blue', text: '角色' }, scene: { color: 'green', text: '场景' },
    audio: { color: 'orange', text: '音频' }, font: { color: 'purple', text: '字体' },
    template: { color: 'cyan', text: '模板' },
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color={(typeMap[t] || { color: 'default', text: t }).color}>{(typeMap[t] || { text: t }).text}</Tag> },
    { title: '文件路径', dataIndex: 'file_path', key: 'file_path', ellipsis: true, render: (p: string) => <a href={p} target="_blank" rel="noreferrer">{p}</a> },
    { title: '上传时间', dataIndex: 'created_at', key: 'created_at', width: 180, render: (t: string) => new Date(t).toLocaleString() },
    { title: '操作', key: 'action', width: 100, render: (_: any, record: any) => <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}><Button type="link" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Space>
          <Title level={2} style={{ margin: 0 }}>资源管理</Title>
          <Select placeholder="类型筛选" style={{ width: 120 }} allowClear value={typeFilter} onChange={setTypeFilter}>
            <Option value="character">角色</Option><Option value="scene">场景</Option><Option value="audio">音频</Option><Option value="font">字体</Option><Option value="template">模板</Option>
          </Select>
        </Space>
        <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalVisible(true)}>上传资源</Button>
      </div>
      <Card>
        <Table columns={columns} dataSource={assets} rowKey="id" loading={loading} pagination={{ pageSize: 20 }} />
      </Card>
      <UploadModal visible={uploadModalVisible} onCancel={() => setUploadModalVisible(false)} onUpload={handleUpload} uploading={uploading} />
    </div>
  );
};

const UploadModal: React.FC<{ visible: boolean; onCancel: () => void; onUpload: (file: any, name: string, type: string) => Promise<void>; uploading: boolean }> = ({ visible, onCancel, onUpload, uploading }) => {
  const [file, setFile] = useState<any>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('character');

  const handleOk = async () => {
    if (!file || !name) { message.warning('请选择文件并输入名称'); return; }
    await onUpload(file, name, type);
    setFile(null); setName(''); setType('character');
  };

  return (
    <Modal title="上传资源" open={visible} onOk={handleOk} onCancel={onCancel} confirmLoading={uploading}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <div><div style={{ marginBottom: 8 }}>资源名称</div><input value={name} onChange={e => setName(e.target.value)} placeholder="请输入资源名称" style={{ width: '100%', padding: '4px 11px', border: '1px solid #d9d9d9', borderRadius: 6 }} /></div>
        <div><div style={{ marginBottom: 8 }}>资源类型</div><Select value={type} onChange={setType} style={{ width: '100%' }}><Option value="character">角色</Option><Option value="scene">场景</Option><Option value="audio">音频</Option><Option value="font">字体</Option><Option value="template">模板</Option></Select></div>
        <div><div style={{ marginBottom: 8 }}>选择文件</div><input type="file" accept="image/*,audio/*,video/*" onChange={e => setFile(e.target.files?.[0])} /></div>
      </Space>
    </Modal>
  );
};

export default Assets;
