package com.demo.temporal;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;

import java.util.Map;

/** 业务 Activity：与编辑器节点 data.type / 约定 task 名对应 */
@ActivityInterface
public interface BizActivity {

    @ActivityMethod
    void submitApplication(Map<String, Object> input);

    @ActivityMethod
    void notifyPass(Map<String, Object> input);

    @ActivityMethod
    void notifyReject(Map<String, Object> input);
}
