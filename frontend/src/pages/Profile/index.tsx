import React, { useState, useEffect } from 'react';
import { Card, Form, Input, Button, Typography, message, Avatar, Upload, Row, Col } from 'antd';
import { UserOutlined, UploadOutlined } from '@ant-design/icons';
import { authAPI } from '../../services/api';

const { Title } = Typography;

interface UserProfile {
  id: number;
  username: string;
  email: string;
  avatar: string;
  created_at: string;
}

const Profile: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);

  const fetchProfile = async () => {
    try {
      const response = await authAPI.getProfile();
      const userData = response.data;
      setUser(userData);
      form.setFieldsValue(userData);
    } catch (error) {
      message.error('获取用户信息失败');
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      await authAPI.updateProfile(values);
      message.success('更新成功');
      fetchProfile();
    } catch (error: any) {
      message.error(error.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Title level={2}>个人资料</Title>

      <Row gutter={24}>
        <Col xs={24} md={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Avatar
                size={120}
                icon={<UserOutlined />}
                src={user?.avatar}
                style={{ marginBottom: '16px' }}
              />
              <Title level={4}>{user?.username}</Title>
              <p>{user?.email}</p>
              <p>注册时间：{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</p>
            </div>
          </Card>
        </Col>

        <Col xs={24} md={16}>
          <Card title="编辑资料">
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
            >
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>

              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { required: true, message: '请输入邮箱' },
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>

              <Form.Item
                name="avatar"
                label="头像URL"
              >
                <Input placeholder="请输入头像URL" />
              </Form.Item>

              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>
                  保存修改
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Profile;